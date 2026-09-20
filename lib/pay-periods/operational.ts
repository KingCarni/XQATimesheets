import "server-only";

import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly } from "@/lib/timesheets/queries";
import { isPeriodEditable, type TimesheetStatus } from "@/types/domain";
import type { DateStr } from "./calc";
import { resolveOperationalPeriod } from "./calc";
import { getEffectivePayPeriodConfigForProject } from "./queries";

/**
 * Operational (project-scoped) submission periods — the runtime resolution layer.
 *
 * The pure mapping (project config + entry date → period boundaries) lives in
 * `calc.ts`; this module persists it. Rows are created LAZILY (only when an entry
 * needs one) and their boundaries are NEVER recomputed once written, so changing a
 * project's pay-period config later cannot move the boundaries of an already
 * submitted/approved/locked historical period.
 *
 * Wiring into the timesheet/approval mutations + UI is the follow-up step; this
 * module is the seam those callers use.
 */

export type OperationalPeriod = {
  id: string;
  projectId: string;
  employeeProfileId: string;
  status: TimesheetStatus;
  start: DateStr;
  end: DateStr;
  editable: boolean;
};

function toOperationalPeriod(row: {
  id: string;
  project_id: string;
  employee_profile_id: string;
  status: TimesheetStatus;
  period_start_date: Date;
  period_end_date: Date;
}): OperationalPeriod {
  return {
    id: row.id,
    projectId: row.project_id,
    employeeProfileId: row.employee_profile_id,
    status: row.status,
    start: dateOnly(row.period_start_date),
    end: dateOnly(row.period_end_date),
    editable: isPeriodEditable(row.status),
  };
}

/**
 * Find-or-create the operational period row for one entry's (employee, project,
 * date). Lazy + idempotent. Boundaries are stamped from the project's CURRENT
 * effective config only when the row is first created (`update: {}` never rewrites
 * an existing row), which is what keeps historic periods immutable across config
 * changes. Tenant-scoped: the project must belong to `organizationId`.
 */
export async function ensureOperationalPeriodForEntry(params: {
  organizationId: string;
  employeeProfileId: string;
  projectId: string;
  entryDate: DateStr;
}): Promise<OperationalPeriod> {
  const { organizationId, employeeProfileId, projectId, entryDate } = params;

  const ctx = await getEffectivePayPeriodConfigForProject(organizationId, projectId);
  const period = resolveOperationalPeriod(ctx.config, entryDate);

  const row = await prisma.project_timesheet_periods.upsert({
    where: {
      employee_profile_id_project_id_period_start_date: {
        employee_profile_id: employeeProfileId,
        project_id: projectId,
        period_start_date: dateInput(period.start),
      },
    },
    create: {
      organization_id: organizationId,
      employee_profile_id: employeeProfileId,
      project_id: projectId,
      period_start_date: dateInput(period.start),
      period_end_date: dateInput(period.end),
      cadence: period.cadence,
      status: "open",
    },
    // Never recompute boundaries/cadence for an existing row — freezing history.
    update: {},
  });

  return toOperationalPeriod(row);
}

/**
 * Resolve which operational period an entry WOULD belong to for a given project +
 * date, without creating a row. Returns the existing row if present (with its
 * frozen boundaries + status), else the boundaries the current config produces.
 * Used to decide whether an edited entry must be re-pointed to a different unit.
 */
export async function peekOperationalPeriodForEntry(params: {
  organizationId: string;
  employeeProfileId: string;
  projectId: string;
  entryDate: DateStr;
}): Promise<{ existing: OperationalPeriod | null; resolvedStart: DateStr; resolvedEnd: DateStr; cadence: string }> {
  const { organizationId, employeeProfileId, projectId, entryDate } = params;

  const ctx = await getEffectivePayPeriodConfigForProject(organizationId, projectId);
  const period = resolveOperationalPeriod(ctx.config, entryDate);

  const row = await prisma.project_timesheet_periods.findUnique({
    where: {
      employee_profile_id_project_id_period_start_date: {
        employee_profile_id: employeeProfileId,
        project_id: projectId,
        period_start_date: dateInput(period.start),
      },
    },
  });

  return {
    existing: row ? toOperationalPeriod(row) : null,
    resolvedStart: period.start,
    resolvedEnd: period.end,
    cadence: period.cadence,
  };
}
