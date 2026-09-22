"use server";

import { revalidatePath } from "next/cache";

import { hasReviewScope, isAdmin } from "@/lib/auth/authorization";
import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { decodePeriodRef } from "@/lib/timesheets/period-ref";
import { notifyManualReminder } from "@/lib/notifications/producers";

/**
 * MHV-3 manual admin reminder (V1). Scoped narrowly:
 *   - admin only (checked via `requireWritableOrganizationAdmin`)
 *   - target period must be Open or Rejected
 *   - single recipient = owning employee
 *   - system-generated copy (no free-form messaging)
 *   - one-per-(period, action, day) dedupe prevents click-spam
 *   - audited in `audit_history`
 *
 * NOT reachable for approved/locked/submitted periods; the button is only
 * rendered by the review-detail page for the allowed statuses.
 */
export async function sendReminder(formData: FormData): Promise<void> {
  const { user, organization, membership } = await requireWritableOrganizationAdmin();
  if (!isAdmin(membership.role)) throw new Error("Admin only.");
  // Belt-and-suspenders — hasReviewScope must also hold.
  if (!(await hasReviewScope({ ...user, role: membership.role }, organization.id))) {
    throw new Error("Not authorized.");
  }

  const periodRef = String(formData.get("periodRef") ?? "");
  if (!periodRef) return;
  const { kind, id } = decodePeriodRef(periodRef);

  let ctx: {
    employeeProfileId: string;
    employeeName: string;
    projectName: string | null;
    periodStart: string;
    periodEnd: string;
    status: "open" | "submitted" | "approved" | "rejected" | "locked";
  } | null = null;

  if (kind === "project") {
    const p = await prisma.project_timesheet_periods.findFirst({
      where: { id, organization_id: organization.id },
      select: {
        employee_profile_id: true,
        period_start_date: true,
        period_end_date: true,
        status: true,
        project: { select: { name: true } },
        employee_profile: { select: { full_name: true } },
      },
    });
    if (!p) throw new Error("Period not found.");
    ctx = {
      employeeProfileId: p.employee_profile_id,
      employeeName: p.employee_profile.full_name,
      projectName: p.project.name,
      periodStart: p.period_start_date.toISOString().slice(0, 10),
      periodEnd: p.period_end_date.toISOString().slice(0, 10),
      status: p.status as never,
    };
  } else {
    const p = await prisma.timesheet_periods.findFirst({
      where: { id, organization_id: organization.id },
      select: {
        employee_profile_id: true,
        week_start_date: true,
        week_end_date: true,
        status: true,
        employee_profile: { select: { full_name: true } },
      },
    });
    if (!p) throw new Error("Period not found.");
    ctx = {
      employeeProfileId: p.employee_profile_id,
      employeeName: p.employee_profile.full_name,
      projectName: null,
      periodStart: p.week_start_date.toISOString().slice(0, 10),
      periodEnd: p.week_end_date.toISOString().slice(0, 10),
      status: p.status as never,
    };
  }

  if (ctx.status !== "open" && ctx.status !== "rejected") {
    throw new Error("Reminders are only for open or rejected periods.");
  }
  const action: "submit" | "correct" = ctx.status === "rejected" ? "correct" : "submit";

  await prisma.$transaction(async (tx) => {
    await notifyManualReminder(
      {
        organizationId: organization.id,
        periodRef,
        kind,
        periodId: id,
        employeeProfileId: ctx!.employeeProfileId,
        employeeName: ctx!.employeeName,
        projectName: ctx!.projectName,
        periodStart: ctx!.periodStart,
        periodEnd: ctx!.periodEnd,
        action,
        actorUserId: user.id,
      },
      tx,
    );
    await tx.audit_history.create({
      data: {
        entity_type: "notification",
        entity_id: id,
        action: "manual_reminder_sent",
        actor_user_id: user.id,
        metadata: { periodRef, kind, action },
        organization_id: organization.id,
      },
    });
  });

  revalidatePath(`/team/${encodeURIComponent(periodRef)}`);
}
