import "server-only";

import { prisma } from "@/lib/prisma";
import { getCutoffState, getSubmissionCutoff } from "@/lib/pay-periods/cutoff";
import { encodePeriodRef } from "@/lib/timesheets/period-ref";
import { ownerUserId } from "./recipients";
import { createNotification } from "./service";
import { cutoffDedupeKey } from "./types";

/**
 * MHV-4 + MHV-3 recurring sweep. Idempotent — designed to be invoked by
 * `/api/cron/cutoff-notifications` (Vercel Cron or equivalent). Safe to run
 * multiple times per hour: dedupe keys prevent duplicate rows for the same
 * (period, event kind).
 *
 * Approved/Locked periods and orgs with cutoff DISABLED are skipped entirely.
 * Submitted periods are NOT considered employee-overdue (see getCutoffState).
 * Sweep runs per organization so a tenant's timezone/policy is applied
 * consistently.
 */
export type SweepResult = {
  organizationsScanned: number;
  periodsScanned: number;
  dueSoonCreated: number;
  overdueCreated: number;
};

export async function runCutoffNotificationSweep(now: Date = new Date()): Promise<SweepResult> {
  const orgs = await prisma.organizations.findMany({
    where: { submission_cutoff_enabled: true },
    select: {
      id: true,
      timezone: true,
      submission_cutoff_offset_days: true,
      submission_cutoff_time: true,
    },
  });

  const result: SweepResult = {
    organizationsScanned: orgs.length,
    periodsScanned: 0,
    dueSoonCreated: 0,
    overdueCreated: 0,
  };

  for (const org of orgs) {
    const policy = {
      enabled: true,
      offsetDays: org.submission_cutoff_offset_days,
      timeLocal: org.submission_cutoff_time,
    };

    // Only Open + Rejected periods can be "employee-overdue" / "due soon".
    // Submitted → awaiting review (not employee action). Approved / Locked
    // → not_actionable. Legacy weekly (General) is included with the same
    // rules; recipient resolution stays the same — owning employee only.
    const [projectPeriods, legacyPeriods] = await Promise.all([
      prisma.project_timesheet_periods.findMany({
        where: { organization_id: org.id, status: { in: ["open", "rejected"] } },
        select: { id: true, employee_profile_id: true, period_end_date: true, status: true },
      }),
      prisma.timesheet_periods.findMany({
        where: { organization_id: org.id, status: { in: ["open", "rejected"] } },
        select: { id: true, employee_profile_id: true, week_end_date: true, status: true },
      }),
    ]);
    const periods = [
      ...projectPeriods.map((p) => ({ kind: "project" as const, id: p.id, employee_profile_id: p.employee_profile_id, period_end_date: p.period_end_date, status: p.status })),
      ...legacyPeriods.map((p) => ({ kind: "legacy" as const, id: p.id, employee_profile_id: p.employee_profile_id, period_end_date: p.week_end_date, status: p.status })),
    ];
    result.periodsScanned += periods.length;

    for (const p of periods) {
      const cutoff = getSubmissionCutoff(p.period_end_date, policy, org.timezone);
      const state = getCutoffState(now, cutoff, p.status);
      if (state !== "due_soon" && state !== "overdue") continue;

      const owner = await ownerUserId(p.employee_profile_id, org.id);
      if (!owner) continue;

      const ref = encodePeriodRef(p.kind, p.id);
      const type = state === "due_soon" ? "cutoff_due_soon" : "cutoff_overdue";
      const inserted = await createNotification({
        organizationId: org.id,
        userId: owner,
        type,
        title: state === "due_soon" ? "Timesheet due soon" : "Timesheet overdue",
        message:
          state === "due_soon"
            ? `Your timesheet is due within 24 hours.`
            : `Your timesheet is past the submission cutoff.`,
        href: `/my-timesheet?period=${encodeURIComponent(ref)}`,
        metadata: { periodRef: ref, cutoff: cutoff?.toISOString() ?? null },
        dedupeKey: cutoffDedupeKey(type, ref),
      });
      if (inserted) {
        if (state === "due_soon") result.dueSoonCreated += 1;
        else result.overdueCreated += 1;
      }
    }
  }

  return result;
}
