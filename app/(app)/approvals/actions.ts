"use server";

import { revalidatePath } from "next/cache";

import { assertCanReviewPeriod } from "@/lib/auth/authorization";
import { requireWritableOrganizationReviewer } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";

async function reviewerContext() {
  const { user, organization, membership } = await requireWritableOrganizationReviewer();
  return { viewer: { ...user, role: membership.role }, organizationId: organization.id };
}

async function transitionPeriod(periodId: string, action: "approve" | "reject", comment?: string) {
  const { viewer, organizationId } = await reviewerContext();
  await assertCanReviewPeriod(viewer, periodId, organizationId);

  if (action === "reject" && (!comment || comment.trim().length < 5)) {
    throw new Error("Rejection reason must be at least 5 characters.");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.timesheet_periods.updateMany({
      where: { id: periodId, organization_id: organizationId, status: "submitted" },
      data:
        action === "approve"
          ? { status: "approved", rejection_reason: null }
          : { status: "rejected", rejection_reason: comment?.trim() },
    });
    if (updated.count !== 1) throw new Error("Only submitted periods can be reviewed.");

    await tx.approvals.create({
      data: {
        timesheet_period_id: periodId,
        actor_user_id: viewer.id,
        action,
        comment: comment?.trim() || null,
        organization_id: organizationId,
      },
    });

    await tx.audit_history.create({
      data: {
        entity_type: "timesheet_period",
        entity_id: periodId,
        action,
        actor_user_id: viewer.id,
        metadata: comment ? { comment: comment.trim() } : {},
        organization_id: organizationId,
      },
    });
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
 * Approve every selected submitted period. Each period is authorized
 * individually against the reviewer's project scope AND the current org, and
 * only rows still `submitted` in this org are transitioned.
 */
export async function bulkApprovePeriods(formData: FormData): Promise<void> {
  const { viewer, organizationId } = await reviewerContext();
  const periodIds = [...new Set(formData.getAll("periodId").map((v) => String(v)).filter(Boolean))];
  if (periodIds.length === 0) return;

  for (const periodId of periodIds) {
    await assertCanReviewPeriod(viewer, periodId, organizationId);
  }

  await prisma.$transaction(async (tx) => {
    for (const periodId of periodIds) {
      const updated = await tx.timesheet_periods.updateMany({
        where: { id: periodId, organization_id: organizationId, status: "submitted" },
        data: { status: "approved", rejection_reason: null },
      });
      if (updated.count !== 1) continue; // no longer submitted — skip silently
      await tx.approvals.create({
        data: { timesheet_period_id: periodId, actor_user_id: viewer.id, action: "approve", organization_id: organizationId },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "timesheet_period",
          entity_id: periodId,
          action: "approve",
          actor_user_id: viewer.id,
          metadata: { bulk: true },
          organization_id: organizationId,
        },
      });
    }
  });

  revalidatePath("/approvals");
  revalidatePath("/team");
}

/**
 * Reject every selected submitted period with a shared reason. Bulk rejection
 * requires a reason (>= 5 chars), mirroring single rejection.
 */
export async function bulkRejectPeriods(formData: FormData): Promise<void> {
  const { viewer, organizationId } = await reviewerContext();
  const comment = String(formData.get("comment") ?? "").trim();
  if (comment.length < 5) throw new Error("Rejection reason must be at least 5 characters.");
  const periodIds = [...new Set(formData.getAll("periodId").map((v) => String(v)).filter(Boolean))];
  if (periodIds.length === 0) return;

  for (const periodId of periodIds) {
    await assertCanReviewPeriod(viewer, periodId, organizationId);
  }

  await prisma.$transaction(async (tx) => {
    for (const periodId of periodIds) {
      const updated = await tx.timesheet_periods.updateMany({
        where: { id: periodId, organization_id: organizationId, status: "submitted" },
        data: { status: "rejected", rejection_reason: comment },
      });
      if (updated.count !== 1) continue;
      await tx.approvals.create({
        data: {
          timesheet_period_id: periodId,
          actor_user_id: viewer.id,
          action: "reject",
          comment,
          organization_id: organizationId,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "timesheet_period",
          entity_id: periodId,
          action: "reject",
          actor_user_id: viewer.id,
          metadata: { bulk: true, comment },
          organization_id: organizationId,
        },
      });
    }
  });

  revalidatePath("/approvals");
  revalidatePath("/team");
}
