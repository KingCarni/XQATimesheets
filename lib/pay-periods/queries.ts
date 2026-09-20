import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly, decimal } from "@/lib/timesheets/queries";
import type { Cadence, DateStr, PayPeriod, PayPeriodConfig } from "./calc";
import {
  getCurrentPayPeriod,
  getNextPayPeriod,
  getPayPeriodForDate,
  getPreviousPayPeriod,
  isValidDateStr,
  todayInTimeZone,
} from "./calc";
import {
  resolveEffectivePayPeriodConfig,
  resolveOrgPayPeriodConfig,
  type EffectivePayPeriodConfig,
  type OrgPayrollRow,
  type PayPeriodConfigSource,
  type ProjectPayrollRow,
} from "./config";

/**
 * Server-side pay-period resolution. Reads the organization's stored payroll
 * columns + timezone (the single source of truth for calendar dates) and hands
 * back the pure `PayPeriodConfig` plus resolved periods. Downstream tickets
 * (MHV-2/4/5/9/10) should consume THESE helpers rather than recomputing cadence
 * math or re-reading the columns.
 */

const PAYROLL_SELECT = {
  timezone: true,
  payroll_period: true,
  payroll_start_weekday: true,
  payroll_anchor_date: true,
  payroll_semimonthly_day: true,
  payroll_monthly_start_day: true,
} satisfies Prisma.organizationsSelect;

const PROJECT_PAYROLL_SELECT = {
  id: true,
  payroll_period_override: true,
  payroll_start_weekday: true,
  payroll_anchor_date: true,
  payroll_semimonthly_day: true,
  payroll_monthly_start_day: true,
} satisfies Prisma.projectsSelect;

type OrgPayrollDbRow = {
  payroll_period: Cadence | null;
  payroll_start_weekday: number | null;
  payroll_anchor_date: Date | null;
  payroll_semimonthly_day: number | null;
  payroll_monthly_start_day: number | null;
};

type ProjectPayrollDbRow = {
  payroll_period_override: Cadence | null;
  payroll_start_weekday: number | null;
  payroll_anchor_date: Date | null;
  payroll_semimonthly_day: number | null;
  payroll_monthly_start_day: number | null;
};

function toOrgRow(org: OrgPayrollDbRow): OrgPayrollRow {
  return {
    payrollPeriod: org.payroll_period,
    payrollStartWeekday: org.payroll_start_weekday,
    payrollAnchorDate: org.payroll_anchor_date ? dateOnly(org.payroll_anchor_date) : null,
    payrollSemimonthlyDay: org.payroll_semimonthly_day,
    payrollMonthlyStartDay: org.payroll_monthly_start_day,
  };
}

function toProjectRow(project: ProjectPayrollDbRow): ProjectPayrollRow {
  return {
    payrollPeriodOverride: project.payroll_period_override,
    payrollStartWeekday: project.payroll_start_weekday,
    payrollAnchorDate: project.payroll_anchor_date ? dateOnly(project.payroll_anchor_date) : null,
    payrollSemimonthlyDay: project.payroll_semimonthly_day,
    payrollMonthlyStartDay: project.payroll_monthly_start_day,
  };
}

export type OrgPayPeriodContext = {
  organizationId: string;
  timezone: string;
  cadence: Cadence;
  config: PayPeriodConfig;
  source: PayPeriodConfigSource;
  /** True when the org has no explicit payroll config and uses the weekly fallback. */
  isFallback: boolean;
};

export async function getOrgPayPeriodContext(organizationId: string): Promise<OrgPayPeriodContext> {
  const org = await prisma.organizations.findUniqueOrThrow({
    where: { id: organizationId },
    select: PAYROLL_SELECT,
  });

  const resolved = resolveOrgPayPeriodConfig(toOrgRow(org));

  return {
    organizationId,
    timezone: org.timezone,
    cadence: resolved.config.cadence,
    config: resolved.config,
    source: resolved.source,
    isFallback: resolved.source === "legacy",
  };
}

/** "Today" as a calendar date in the organization's timezone (never the server clock). */
export function orgToday(ctx: OrgPayPeriodContext, now?: Date): DateStr {
  return todayInTimeZone(ctx.timezone, now);
}

export type PayPeriodNavigation = {
  previous: PayPeriod;
  current: PayPeriod;
  next: PayPeriod;
  isCurrent: boolean;
};

/**
 * Resolve the selected period (from a `?period=yyyy-MM-dd` id, defaulting to the
 * org-local current period) along with its previous/next neighbours — the
 * reusable current/previous/next navigation primitive.
 */
export function resolvePayPeriodNavigation(
  ctx: OrgPayPeriodContext,
  selectedId?: string | null,
  now?: Date,
): PayPeriodNavigation {
  const today = orgToday(ctx, now);
  const currentToday = getCurrentPayPeriod(ctx.config, today);
  const selected =
    selectedId && isValidDateStr(selectedId)
      ? getPayPeriodForDate(ctx.config, selectedId)
      : currentToday;

  return {
    previous: getPreviousPayPeriod(ctx.config, selected),
    current: selected,
    next: getNextPayPeriod(ctx.config, selected),
    isCurrent: selected.id === currentToday.id,
  };
}

/**
 * Prisma `entry_date` filter for a pay period. Date-level, inclusive of both
 * boundaries, using the app's UTC-midnight date-only convention (`dateInput`).
 *
 * This is the architectural crux of MHV-8: because `time_entries.entry_date` is
 * a real calendar date, a payroll period that cuts THROUGH a weekly timesheet
 * (e.g. period ends Sat Sep 19 while a Mon–Sun week runs to Sep 20) includes
 * only the entries whose own date falls in [start, end] — never a whole week.
 */
export function payPeriodEntryDateFilter(period: Pick<PayPeriod, "start" | "end">): Prisma.DateTimeFilter {
  return { gte: dateInput(period.start), lte: dateInput(period.end) };
}

/**
 * Foundational org-scoped total: hours recorded on dates inside the period.
 * Kept intentionally small — MHV-2/5/9 will layer employee/project scoping and
 * status presets on top (see `lib/reports/queries.ts` for the richer pattern).
 * Always tenant-scoped; never crosses organizations.
 */
export async function sumOrgHoursInPayPeriod(
  organizationId: string,
  period: Pick<PayPeriod, "start" | "end">,
): Promise<number> {
  const result = await prisma.time_entries.aggregate({
    where: { organization_id: organizationId, entry_date: payPeriodEntryDateFilter(period) },
    _sum: { hours: true },
  });
  return result._sum.hours ? decimal(result._sum.hours) : 0;
}

// ------------------------------------------------------------ project context
//
// Project overrides. Employees may log entries against multiple projects that
// use DIFFERENT effective calendars, so project-specific payroll/reporting must
// resolve each entry's period from the ENTRY'S PROJECT — never a single period
// stamped on the weekly timesheet. `timesheet_periods` is NOT mutated. Downstream
// tickets (MHV-2/5/9/10) resolve config per project (batch where many), then
// filter `time_entries` by `entry_date` + `project_id`.

export type ProjectPayPeriodContext = EffectivePayPeriodConfig & {
  organizationId: string;
  projectId: string;
  timezone: string;
  /** True when the project inherits the org (no override) rather than defining its own. */
  inherits: boolean;
};

/**
 * Effective config for one project, applying precedence (project → org → legacy).
 * Tenant-scoped: the project must belong to `organizationId`. Timezone always
 * comes from the organization — projects never carry their own timezone.
 */
export async function getEffectivePayPeriodConfigForProject(
  organizationId: string,
  projectId: string,
): Promise<ProjectPayPeriodContext> {
  const [org, project] = await Promise.all([
    prisma.organizations.findUniqueOrThrow({ where: { id: organizationId }, select: PAYROLL_SELECT }),
    prisma.projects.findFirstOrThrow({
      where: { id: projectId, organization_id: organizationId },
      select: PROJECT_PAYROLL_SELECT,
    }),
  ]);

  const projectRow = toProjectRow(project);
  const resolved = resolveEffectivePayPeriodConfig(toOrgRow(org), projectRow);
  return {
    organizationId,
    projectId,
    timezone: org.timezone,
    inherits: projectRow.payrollPeriodOverride == null,
    ...resolved,
  };
}

/**
 * Batch resolver: effective config for many projects with ONE org read + ONE
 * projects query (no N+1). Projects not found in the org are omitted. Use this
 * from report code that resolves many projects at once.
 */
export async function getEffectiveConfigsForProjects(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, EffectivePayPeriodConfig>> {
  const out = new Map<string, EffectivePayPeriodConfig>();
  if (projectIds.length === 0) return out;

  const [org, projects] = await Promise.all([
    prisma.organizations.findUniqueOrThrow({ where: { id: organizationId }, select: PAYROLL_SELECT }),
    prisma.projects.findMany({
      where: { id: { in: projectIds }, organization_id: organizationId },
      select: PROJECT_PAYROLL_SELECT,
    }),
  ]);

  const orgRow = toOrgRow(org);
  for (const project of projects) {
    out.set(project.id, resolveEffectivePayPeriodConfig(orgRow, toProjectRow(project)));
  }
  return out;
}

/** The project's pay period containing a calendar date, using its effective config. */
export function getPayPeriodForProjectDate(ctx: ProjectPayPeriodContext, date: DateStr): PayPeriod {
  return getPayPeriodForDate(ctx.config, date);
}

/** List `count` consecutive project pay periods starting at the one containing `fromDate`. */
export function listProjectPayPeriods(
  ctx: ProjectPayPeriodContext,
  fromDate: DateStr,
  count: number,
): PayPeriod[] {
  const first = getPayPeriodForDate(ctx.config, fromDate);
  const periods: PayPeriod[] = [first];
  for (let i = 1; i < Math.abs(count); i++) {
    const step =
      count >= 0
        ? getNextPayPeriod(ctx.config, periods[periods.length - 1])
        : getPreviousPayPeriod(ctx.config, periods[0]);
    if (count >= 0) periods.push(step);
    else periods.unshift(step);
  }
  return periods;
}

/**
 * Project-scoped total for a period: hours whose `entry_date` falls in [start,end]
 * AND whose `project_id` matches. This is the correct multi-calendar primitive —
 * a period that cuts through a weekly timesheet includes only in-range dates for
 * that project. Always tenant-scoped.
 */
export async function sumProjectHoursInPayPeriod(
  organizationId: string,
  projectId: string,
  period: Pick<PayPeriod, "start" | "end">,
): Promise<number> {
  const result = await prisma.time_entries.aggregate({
    where: {
      organization_id: organizationId,
      project_id: projectId,
      entry_date: payPeriodEntryDateFilter(period),
    },
    _sum: { hours: true },
  });
  return result._sum.hours ? decimal(result._sum.hours) : 0;
}
