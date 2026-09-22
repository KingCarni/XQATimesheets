import "server-only";

import { Prisma } from "@prisma/client";
import { encodePeriodRef } from "@/lib/timesheets/period-ref";
import { adminUserIds, ownerUserId, reviewerUserIdsForProject } from "./recipients";
import { createNotification, createNotifications } from "./service";

/**
 * MHV-3 workflow event producers. Each is invoked inside the same Prisma
 * transaction as the workflow mutation so status + notification stay
 * consistent. Recipients are always authorization-scoped (see recipients.ts).
 *
 * These helpers are the ONLY sanctioned way to produce timesheet
 * notifications. Do not insert directly from a page or action.
 */

type ProjectPeriodCtx = {
  organizationId: string;
  periodId: string;
  employeeProfileId: string;
  projectId: string;
  projectName: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  actorUserId: string;
};

type LegacyPeriodCtx = {
  organizationId: string;
  periodId: string;
  employeeProfileId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  actorUserId: string;
};

function periodRange(start: string, end: string): string {
  return `${start} → ${end}`;
}

export async function notifyProjectPeriodSubmitted(ctx: ProjectPeriodCtx, tx?: Prisma.TransactionClient): Promise<number> {
  const recipients = await reviewerUserIdsForProject(ctx.organizationId, ctx.projectId, ctx.actorUserId, tx);
  const ref = encodePeriodRef("project", ctx.periodId);
  return createNotifications(
    recipients.map((userId) => ({
      organizationId: ctx.organizationId,
      userId,
      type: "timesheet_submitted" as const,
      title: "Timesheet submitted",
      message: `${ctx.employeeName} · ${ctx.projectName} · ${periodRange(ctx.periodStart, ctx.periodEnd)}`,
      href: `/approvals?tab=timesheets&period=${encodeURIComponent(ref)}`,
      metadata: { periodRef: ref, projectId: ctx.projectId, employeeProfileId: ctx.employeeProfileId },
    })),
    tx,
  );
}

export async function notifyLegacyPeriodSubmitted(ctx: LegacyPeriodCtx, tx?: Prisma.TransactionClient): Promise<number> {
  // Legacy weekly / General is admin-only.
  const recipients = await adminUserIds(ctx.organizationId, ctx.actorUserId, tx);
  const ref = encodePeriodRef("legacy", ctx.periodId);
  return createNotifications(
    recipients.map((userId) => ({
      organizationId: ctx.organizationId,
      userId,
      type: "timesheet_submitted" as const,
      title: "Timesheet submitted (General)",
      message: `${ctx.employeeName} · ${periodRange(ctx.periodStart, ctx.periodEnd)}`,
      href: `/approvals?tab=timesheets&period=${encodeURIComponent(ref)}`,
      metadata: { periodRef: ref, employeeProfileId: ctx.employeeProfileId },
    })),
    tx,
  );
}

export async function notifyPeriodApproved(
  ctx: (ProjectPeriodCtx | LegacyPeriodCtx) & { kind: "project" | "legacy"; projectName?: string },
  tx?: Prisma.TransactionClient,
): Promise<string | null> {
  const owner = await ownerUserId(ctx.employeeProfileId, ctx.organizationId, tx);
  if (!owner) return null;
  const ref = encodePeriodRef(ctx.kind, ctx.periodId);
  return createNotification(
    {
      organizationId: ctx.organizationId,
      userId: owner,
      type: "timesheet_approved",
      title: "Timesheet approved",
      message: `${ctx.projectName ?? "General"} · ${periodRange(ctx.periodStart, ctx.periodEnd)}`,
      href: `/my-timesheet?period=${encodeURIComponent(ref)}`,
      metadata: { periodRef: ref },
    },
    tx,
  );
}

export async function notifyPeriodRejected(
  ctx: (ProjectPeriodCtx | LegacyPeriodCtx) & { kind: "project" | "legacy"; projectName?: string; reason?: string | null },
  tx?: Prisma.TransactionClient,
): Promise<string | null> {
  const owner = await ownerUserId(ctx.employeeProfileId, ctx.organizationId, tx);
  if (!owner) return null;
  const ref = encodePeriodRef(ctx.kind, ctx.periodId);
  return createNotification(
    {
      organizationId: ctx.organizationId,
      userId: owner,
      type: "timesheet_rejected",
      title: "Timesheet rejected — please review",
      message: `${ctx.projectName ?? "General"} · ${periodRange(ctx.periodStart, ctx.periodEnd)}${ctx.reason ? ` — ${ctx.reason}` : ""}`,
      href: `/my-timesheet?period=${encodeURIComponent(ref)}`,
      metadata: { periodRef: ref, reason: ctx.reason ?? null },
    },
    tx,
  );
}

/**
 * Manual admin reminder (V1, scoped narrowly per user spec):
 *   - admin only
 *   - target period is Open or Rejected
 *   - single recipient = owning employee
 *   - system-generated copy (no free-form messaging)
 *   - dedupe key includes actor+date so a click doesn't spam
 */
export async function notifyManualReminder(
  ctx: {
    organizationId: string;
    periodRef: string;
    kind: "project" | "legacy";
    periodId: string;
    employeeProfileId: string;
    employeeName: string;
    projectName: string | null;
    periodStart: string;
    periodEnd: string;
    action: "submit" | "correct";
    actorUserId: string;
  },
  tx?: Prisma.TransactionClient,
): Promise<string | null> {
  const owner = await ownerUserId(ctx.employeeProfileId, ctx.organizationId, tx);
  if (!owner) return null;
  const label = ctx.projectName ?? "General";
  const verb = ctx.action === "submit" ? "needs submission" : "needs correction and resubmission";
  const today = new Date().toISOString().slice(0, 10);
  return createNotification(
    {
      organizationId: ctx.organizationId,
      userId: owner,
      type: "timesheet_reminder",
      title: "Timesheet reminder",
      message: `${label} · ${periodRange(ctx.periodStart, ctx.periodEnd)} ${verb}.`,
      href: `/my-timesheet?period=${encodeURIComponent(ctx.periodRef)}`,
      // dedupe: one reminder per (period, action, day) — prevents click-spam
      // while allowing an admin to nudge again the next day.
      dedupeKey: `reminder:${ctx.periodRef}:${ctx.action}:${today}`,
      metadata: { periodRef: ctx.periodRef, action: ctx.action, sentBy: ctx.actorUserId },
    },
    tx,
  );
}
