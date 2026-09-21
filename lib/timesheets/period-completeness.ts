import "server-only";

import { prisma } from "@/lib/prisma";
import type { DateStr } from "@/lib/pay-periods/calc";
import { dateInput, dateOnly } from "./queries";
import {
  assessEntryRows,
  type EntryRowForCompleteness,
  type PeriodCompletenessResult,
} from "./entry-validation";

/**
 * MHV-11 submission gate — verify every persisted entry in a submission block
 * satisfies the row-completeness rules. Uses the SAME pure validator as add /
 * edit, so a period that could be saved row-by-row can also be submitted
 * (unless legacy bad data violates the current rules — then submit is blocked
 * until fixed). Never mutates period status; callers decide.
 *
 * This file is a thin DB shim: it fetches the rows and delegates the rules to
 * `assessEntryRows` in `period-completeness-pure.ts`, which is what the unit
 * tests exercise.
 *
 * IMPORTANT ordering guarantee (callers rely on this):
 *   1) fetch entries in range,
 *   2) run this assessor,
 *   3) IF `ok === false`, return the error to the caller — DO NOT mutate,
 *   4) only when `ok === true` may the caller open a transaction to change
 *      the period's status. See `submitProjectPeriod` / `submitWeek` in
 *      `app/(app)/my-timesheet/actions.ts` for the wired form of this order.
 */

export type { PeriodCompletenessResult, IncompleteEntry } from "./entry-validation";

/**
 * Validate every entry a project pay-period submission would freeze. Scoped
 * strictly to (employee, project, [periodStart, periodEnd]) so it cannot
 * accidentally pull in another project's or another period's rows. Each entry
 * is judged with the pure validator using its own project's `requires_platform`
 * flag (fetched in the same query so we never make N extra round trips).
 */
export async function validateProjectPeriodForSubmission(params: {
  organizationId: string;
  employeeProfileId: string;
  projectId: string;
  periodStart: DateStr;
  periodEnd: DateStr;
}): Promise<PeriodCompletenessResult> {
  const rows = await prisma.time_entries.findMany({
    where: {
      employee_profile_id: params.employeeProfileId,
      organization_id: params.organizationId,
      project_id: params.projectId,
      entry_date: { gte: dateInput(params.periodStart), lte: dateInput(params.periodEnd) },
    },
    select: {
      id: true,
      entry_date: true,
      hours: true,
      activity_type_id: true,
      project_id: true,
      platform_id: true,
      project: { select: { requires_platform: true } },
    },
  });

  const shaped: EntryRowForCompleteness[] = rows.map((r) => ({
    entryId: r.id,
    entryDate: dateOnly(r.entry_date),
    hours: r.hours.toNumber(),
    activityTypeId: r.activity_type_id,
    projectId: r.project_id,
    platformId: r.platform_id,
    project: r.project ? { requiresPlatform: r.project.requires_platform } : null,
  }));
  return assessEntryRows(shaped);
}

/**
 * The General/legacy weekly variant — same rule set, scoped to the employee's
 * NULL-project entries in that week. Kept as its own function so callers stay
 * explicit about which submission block they mean.
 */
export async function validateGeneralWeekForSubmission(params: {
  organizationId: string;
  employeeProfileId: string;
  weekStart: DateStr;
  weekEnd: DateStr;
}): Promise<PeriodCompletenessResult> {
  const rows = await prisma.time_entries.findMany({
    where: {
      employee_profile_id: params.employeeProfileId,
      organization_id: params.organizationId,
      project_id: null,
      entry_date: { gte: dateInput(params.weekStart), lte: dateInput(params.weekEnd) },
    },
    select: {
      id: true,
      entry_date: true,
      hours: true,
      activity_type_id: true,
      project_id: true,
      platform_id: true,
    },
  });

  const shaped: EntryRowForCompleteness[] = rows.map((r) => ({
    entryId: r.id,
    entryDate: dateOnly(r.entry_date),
    hours: r.hours.toNumber(),
    activityTypeId: r.activity_type_id,
    projectId: r.project_id,
    platformId: r.platform_id,
    project: null,
  }));
  return assessEntryRows(shaped);
}
