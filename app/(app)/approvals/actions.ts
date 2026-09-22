"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { assertCanReviewPeriodRef } from "@/lib/auth/authorization";
import { requireWritableOrganizationReviewer } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import type { PeriodKind } from "@/lib/timesheets/period-ref";
import { notifyPeriodApproved, notifyPeriodRejected } from "@/lib/notifications/producers";

async function reviewerContext() {
  const { user, organization, membership } = await requireWritableOrganizationReviewer();
  return { viewer: { ...user, role: membership.role }, organizationId: organization.id };
}

/**
 * Apply an approve/reject transition to one period (project or legacy) inside a
 * transaction: flip the status (only if still `submitted`), record an approval
 * row against the correct FK, audit it, and produce a notification back to
 * the owning employee. All in the same transaction so notification/state stay
 * consistent.
 */
async function applyTransition(
  tx: Prisma.TransactionClient,
  ref: { kind: PeriodKind; id: string },
  organizationId: string,
  actorUserId: string,
  action: "approve" | "reject",
  comment?: string,
): Promise<boolean> {
  const data =
    action === "approve"
      ? { status: "approved" as const, rejection_reason: null }
      : { status: "rejected" as const, rejection_reason: comment?.trim() ?? null };

  if (ref.kind === "project") {
    const updated = await tx.project_timesheet_periods.updateMany({
      where: { id: ref.id, organization_id: organizationId, status: "submitted" },
      data,
    });
    if (updated.count !== 1) return false;
    await tx.approvals.create({
      data: {
        project_period_id: ref.id,
        actor_user_id: actorUserId,
        action,
        comment: comment?.trim() || null,
        organization_id: organizationId,
      },
    });
    await tx.audit_history.create({
      data: {
        entity_type: "project_timesheet_period",
        entity_id: ref.id,
        action,
        actor_user_id: actorUserId,
        metadata: comment ? { comment: comment.trim() } : {},
        organization_id: organizationId,
      },
    });
    // MHV-3 back-notification. Fetch minimal context for the message copy.
    const period = await tx.project_timesheet_periods.findUnique({
      where: { id: ref.id },
      select: {
        employee_profile_id: true,
        period_start_date: true,
        period_end_date: true,
        project: { select: { name: true } },
        employee_profile: { select: { full_name: true } },
      },
    });
    if (period) {
      const ctx = {
        organizationId,
        periodId: ref.id,
        kind: "project" as const,
        employeeProfileId: period.employee_profile_id,
        employeeName: period.employee_profile.full_name,
        projectId: "",
        projectName: period.project.name,
        periodStart: period.period_start_date.toISOString().slice(0, 10),
        periodEnd: period.period_end_date.toISOString().slice(0, 10),
        actorUserId,
      };
      if (action === "approve") await notifyPeriodApproved(ctx, tx);
      else await notifyPeriodRejected({ ...ctx, reason: comment?.trim() ?? null }, tx);
    }
    return true;
  }

  const updated = await tx.timesheet_periods.updateMany({
    where: { id: ref.id, organization_id: organizationId, status: "submitted" },
    data,
  });
  if (updated.count !== 1) return false;
  await tx.approvals.create({
    data: {
      timesheet_period_id: ref.id,
      actor_user_id: actorUserId,
      action,
      comment: comment?.trim() || null,
      organization_id: organizationId,
    },
  });
  await tx.audit_history.create({
    data: {
      entity_type: "timesheet_period",
      entity_id: ref.id,
      action,
      actor_user_id: actorUserId,
      metadata: comment ? { comment: comment.trim() } : {},
      organization_id: organizationId,
    },
  });
  const legacy = await tx.timesheet_periods.findUnique({
    where: { id: ref.id },
    select: {
      employee_profile_id: true,
      week_start_date: true,
      week_end_date: true,
      employee_profile: { select: { full_name: true } },
    },
  });
  if (legacy) {
    const ctx = {
      organizationId,
      periodId: ref.id,
      kind: "legacy" as const,
      employeeProfileId: legacy.employee_profile_id,
      employeeName: legacy.employee_profile.full_name,
      projectId: "",
      projectName: "General",
      periodStart: legacy.week_start_date.toISOString().slice(0, 10),
      periodEnd: legacy.week_end_date.toISOString().slice(0, 10),
      actorUserId,
    };
    if (action === "approve") await notifyPeriodApproved(ctx, tx);
    else await notifyPeriodRejected({ ...ctx, reason: comment?.trim() ?? null }, tx);
  }
  return true;
}

async function transitionPeriod(periodRef: string, action: "approve" | "reject", comment?: string) {
  const { viewer, organizationId } = await reviewerContext();
  const ref = await assertCanReviewPeriodRef(viewer, periodRef, organizationId);

  if (action === "reject" && (!comment || comment.trim().length < 5)) {
    throw new Error("Rejection reason must be at least 5 characters.");
  }

  await prisma.$transaction(async (tx) => {
    const ok = await applyTransition(tx, ref, organizationId, viewer.id, action, comment);
    if (!ok) throw new Error("Only submitted periods can be reviewed.");
  });
}

export async function approvePeriod(formData: FormData): Promise<void> {
  await transitionPeriod(String(formData.get("periodId") ?? ""), "approve");
  revalidatePath("/approvals");
  revalidatePath("/team");
}

export async function rejectPeriod(formData: FormData): Promise<void> {
  await transitionPeriod(
    String(formData.get("periodId") ?? ""),
    "reject",
    String(formData.get("comment") ?? ""),
  );
  revalidatePath("/approvals");
  revalidatePath("/team");
}

/**
 * Approve every selected submitted period. Each is authorized individually
 * against the reviewer's project scope AND the current org; only rows still
 * `submitted` are transitioned. Project A and Project B are independent.
 */
export async function bulkApprovePeriods(formData: FormData): Promise<void> {
  const { viewer, organizationId } = await reviewerContext();
  const refs = [...new Set(formData.getAll("periodId").map((v) => String(v)).filter(Boolean))];
  if (refs.length === 0) return;

  const authorized = await Promise.all(refs.map((r) => assertCanReviewPeriodRef(viewer, r, organizationId)));

  await prisma.$transaction(async (tx) => {
    for (const ref of authorized) {
      await applyTransition(tx, ref, organizationId, viewer.id, "approve");
    }
  });

  revalidatePath("/approvals");
  revalidatePath("/team");
}

/** Reject every selected submitted period with a shared reason (>= 5 chars). */
export async function bulkRejectPeriods(formData: FormData): Promise<void> {
  const { viewer, organizationId } = await reviewerContext();
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length < 5) throw new Error("Rejection reason must be at least 5 characters.");
  const refs = [...new Set(formData.getAll("periodId").map((v) => String(v)).filter(Boolean))];
  if (refs.length === 0) return;

  const authorized = await Promise.all(refs.map((r) => assertCanReviewPeriodRef(viewer, r, organizationId)));

  await prisma.$transaction(async (tx) => {
    for (const ref of authorized) {
      await applyTransition(tx, ref, organizationId, viewer.id, "reject", comment);
    }
  });

  revalidatePath("/approvals");
  revalidatePath("/team");
}
