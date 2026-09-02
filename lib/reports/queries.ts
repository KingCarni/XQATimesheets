import "server-only";

import type { Prisma } from "@prisma/client";

import { getReviewableProfileIds, isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly, decimal, timestamp } from "@/lib/timesheets/queries";
import type { DateStr } from "@/lib/timesheets/week";
import type { TimesheetStatus } from "@/types/domain";

/**
 * Status presets for reporting. Business reporting defaults to APPROVED
 * hours only (the authoritative, reviewed record). The other presets exist
 * so submitted/rejected hours can be included later without touching the
 * query shape — only this map changes.
 */
export const REPORT_STATUS_PRESETS = {
  approved: ["approved"],
  approved_and_submitted: ["approved", "submitted"],
  all: ["open", "submitted", "approved", "rejected", "locked"],
} satisfies Record<string, TimesheetStatus[]>;

export type ReportStatusPreset = keyof typeof REPORT_STATUS_PRESETS;

export const DEFAULT_REPORT_STATUS: ReportStatusPreset = "approved";

export type ReportFilters = {
  start?: DateStr;
  end?: DateStr;
  employeeId?: string;
  projectId?: string;
  platformId?: string;
  activityTypeId?: string;
  status?: ReportStatusPreset;
};

function statusesFor(filters: ReportFilters): TimesheetStatus[] {
  const preset = filters.status && filters.status in REPORT_STATUS_PRESETS ? filters.status : DEFAULT_REPORT_STATUS;
  return REPORT_STATUS_PRESETS[preset] as TimesheetStatus[];
}

/**
 * Authorized scope for report data: admin sees everything, a manager/lead
 * sees only employees reachable through an active project assignment where
 * their own assignment role is lead/manager (same rule as Approvals/Team).
 * A `null` reviewable-ids result (admin) means "no employee filter"; an
 * empty array means "no access" and must still filter to nothing.
 */
async function employeeScopeWhere(viewer: CurrentUser): Promise<Prisma.time_entriesWhereInput> {
  if (isAdmin(viewer.role)) return {};
  const reviewableIds = await getReviewableProfileIds(viewer);
  return { employee_profile_id: { in: reviewableIds ?? [] } };
}

async function buildEntryWhere(
  viewer: CurrentUser,
  filters: ReportFilters,
): Promise<Prisma.time_entriesWhereInput> {
  const scope = await employeeScopeWhere(viewer);
  const statuses = statusesFor(filters);

  const entryDate: Prisma.DateTimeFilter = {};
  if (filters.start) entryDate.gte = dateInput(filters.start);
  if (filters.end) entryDate.lte = dateInput(filters.end);

  const where: Prisma.time_entriesWhereInput = {
    ...scope,
    timesheet_period: { status: { in: statuses } },
    ...(filters.start || filters.end ? { entry_date: entryDate } : {}),
  };

  if (filters.employeeId) where.employee_profile_id = filters.employeeId;
  if (filters.projectId) where.project_id = filters.projectId;
  if (filters.platformId) where.platform_id = filters.platformId;
  if (filters.activityTypeId) where.activity_type_id = filters.activityTypeId;

  return where;
}

export type ReportFilterOptions = {
  employees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  platforms: { id: string; name: string }[];
  activityTypes: { id: string; name: string }[];
};

/** Dropdown/filter option lists, scoped the same way as the report data. */
export async function getReportFilterOptions(viewer: CurrentUser): Promise<ReportFilterOptions> {
  const scope = await employeeScopeWhere(viewer);
  const employeeIdFilter =
    "employee_profile_id" in scope ? (scope.employee_profile_id as { in: string[] } | undefined) : undefined;

  const [employees, projects, platforms, activityTypes] = await Promise.all([
    prisma.employee_profiles.findMany({
      where: employeeIdFilter ? { id: employeeIdFilter } : {},
      select: { id: true, full_name: true },
      orderBy: { full_name: "asc" },
    }),
    isAdmin(viewer.role)
      ? prisma.projects.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : prisma.projects.findMany({
          where: {
            is_active: true,
            project_assignments: { some: { employee_profile_id: { in: employeeIdFilter?.in ?? [] } } },
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
    prisma.platforms.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { sort_order: "asc" } }),
    prisma.activity_types.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { sort_order: "asc" },
    }),
  ]);

  return {
    employees: employees.map((e) => ({ id: e.id, name: e.full_name })),
    projects,
    platforms,
    activityTypes,
  };
}

export type ReportSummary = {
  totalHours: number;
  billableHours: number;
  ptoHours: number;
  employeeCount: number;
  projectCount: number;
};

export async function getReportSummary(viewer: CurrentUser, filters: ReportFilters): Promise<ReportSummary> {
  const where = await buildEntryWhere(viewer, filters);

  const [totals, billable, pto, employeeRows, projectRows] = await Promise.all([
    prisma.time_entries.aggregate({ where, _sum: { hours: true } }),
    prisma.time_entries.aggregate({
      where: { ...where, activity_type: { is_billable: true } },
      _sum: { hours: true },
    }),
    prisma.time_entries.aggregate({
      where: { ...where, activity_type: { is_pto: true } },
      _sum: { hours: true },
    }),
    prisma.time_entries.groupBy({ by: ["employee_profile_id"], where }),
    prisma.time_entries.groupBy({ by: ["project_id"], where: { ...where, project_id: { not: null } } }),
  ]);

  return {
    totalHours: totals._sum.hours ? decimal(totals._sum.hours) : 0,
    billableHours: billable._sum.hours ? decimal(billable._sum.hours) : 0,
    ptoHours: pto._sum.hours ? decimal(pto._sum.hours) : 0,
    employeeCount: employeeRows.length,
    projectCount: projectRows.length,
  };
}

export type HoursBreakdownRow = { id: string; label: string; hours: number };

async function breakdownBy(
  viewer: CurrentUser,
  filters: ReportFilters,
  field: "project_id" | "employee_profile_id" | "platform_id" | "activity_type_id",
  labels: (ids: string[]) => Promise<Map<string, string>>,
  fallbackLabel: string,
): Promise<HoursBreakdownRow[]> {
  const where = await buildEntryWhere(viewer, filters);
  const grouped = await prisma.time_entries.groupBy({
    by: [field],
    where,
    _sum: { hours: true },
  });

  const ids = grouped.map((g) => g[field]).filter((id): id is string => Boolean(id));
  const labelMap = await labels(ids);

  return grouped
    .map((g) => {
      const id = g[field] as string | null;
      return {
        id: id ?? "none",
        label: id ? (labelMap.get(id) ?? "Unknown") : fallbackLabel,
        hours: g._sum.hours ? decimal(g._sum.hours) : 0,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

export async function getHoursByProject(viewer: CurrentUser, filters: ReportFilters): Promise<HoursBreakdownRow[]> {
  return breakdownBy(
    viewer,
    filters,
    "project_id",
    async (ids) => {
      const rows = await prisma.projects.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    "No project",
  );
}

export async function getHoursByEmployee(viewer: CurrentUser, filters: ReportFilters): Promise<HoursBreakdownRow[]> {
  return breakdownBy(
    viewer,
    filters,
    "employee_profile_id",
    async (ids) => {
      const rows = await prisma.employee_profiles.findMany({
        where: { id: { in: ids } },
        select: { id: true, full_name: true },
      });
      return new Map(rows.map((r) => [r.id, r.full_name]));
    },
    "Unknown employee",
  );
}

export async function getHoursByPlatform(viewer: CurrentUser, filters: ReportFilters): Promise<HoursBreakdownRow[]> {
  return breakdownBy(
    viewer,
    filters,
    "platform_id",
    async (ids) => {
      const rows = await prisma.platforms.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    "No platform",
  );
}

export async function getHoursByActivityType(
  viewer: CurrentUser,
  filters: ReportFilters,
): Promise<HoursBreakdownRow[]> {
  return breakdownBy(
    viewer,
    filters,
    "activity_type_id",
    async (ids) => {
      const rows = await prisma.activity_types.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    },
    "Unknown work type",
  );
}

export type WeekBreakdownRow = { weekStart: DateStr; hours: number };

/**
 * Hours by week. `time_entries` doesn't carry a week directly, so this
 * groups by the owning period (cheap — one row per employee/week) and then
 * folds those sums into calendar weeks.
 */
export async function getHoursByWeek(viewer: CurrentUser, filters: ReportFilters): Promise<WeekBreakdownRow[]> {
  const where = await buildEntryWhere(viewer, filters);
  const grouped = await prisma.time_entries.groupBy({
    by: ["timesheet_period_id"],
    where,
    _sum: { hours: true },
  });

  const periodIds = grouped.map((g) => g.timesheet_period_id);
  const periods = await prisma.timesheet_periods.findMany({
    where: { id: { in: periodIds } },
    select: { id: true, week_start_date: true },
  });
  const weekByPeriod = new Map(periods.map((p) => [p.id, dateOnly(p.week_start_date)]));

  const totals = new Map<DateStr, number>();
  for (const g of grouped) {
    const week = weekByPeriod.get(g.timesheet_period_id);
    if (!week) continue;
    const hours = g._sum.hours ? decimal(g._sum.hours) : 0;
    totals.set(week, (totals.get(week) ?? 0) + hours);
  }

  return [...totals.entries()]
    .map(([weekStart, hours]) => ({ weekStart, hours }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type ReportRow = {
  id: string;
  date: DateStr;
  employee: string;
  project: string;
  platform: string;
  hours: number;
  workType: string;
  description: string;
  status: TimesheetStatus;
  weekStart: DateStr;
  approvedBy: string | null;
  approvedAt: string | null;
};

/**
 * Full detail rows for the on-page table and for export. `limit` caps the
 * on-page preview; exports pass no limit so the file matches the filters
 * exactly.
 */
export async function getReportRows(
  viewer: CurrentUser,
  filters: ReportFilters,
  opts: { limit?: number } = {},
): Promise<{ rows: ReportRow[]; truncated: boolean }> {
  const where = await buildEntryWhere(viewer, filters);

  const entries = await prisma.time_entries.findMany({
    where,
    include: {
      employee_profile: { select: { full_name: true } },
      project: { select: { name: true } },
      platform: { select: { name: true } },
      activity_type: { select: { name: true } },
      timesheet_period: { select: { id: true, status: true, week_start_date: true } },
    },
    orderBy: [{ entry_date: "desc" }, { created_at: "desc" }],
    take: opts.limit ? opts.limit + 1 : undefined,
  });

  const truncated = Boolean(opts.limit && entries.length > opts.limit);
  const page = opts.limit ? entries.slice(0, opts.limit) : entries;

  const periodIds = [...new Set(page.map((e) => e.timesheet_period.id))];
  const approvals = periodIds.length
    ? await prisma.approvals.findMany({
        where: { timesheet_period_id: { in: periodIds }, action: "approve" },
        include: { actor: { include: { employee_profile: true } } },
        orderBy: { created_at: "desc" },
      })
    : [];
  const latestApprovalByPeriod = new Map<string, { name: string; at: string }>();
  for (const approval of approvals) {
    if (latestApprovalByPeriod.has(approval.timesheet_period_id)) continue;
    latestApprovalByPeriod.set(approval.timesheet_period_id, {
      name: approval.actor.employee_profile?.full_name ?? approval.actor.email,
      at: timestamp(approval.created_at),
    });
  }

  const rows: ReportRow[] = page.map((entry) => {
    const approval = latestApprovalByPeriod.get(entry.timesheet_period.id);
    return {
      id: entry.id,
      date: dateOnly(entry.entry_date),
      employee: entry.employee_profile.full_name,
      project: entry.project?.name ?? "None",
      platform: entry.platform?.name ?? "None",
      hours: decimal(entry.hours),
      workType: entry.activity_type.name,
      description: entry.description,
      status: entry.timesheet_period.status,
      weekStart: dateOnly(entry.timesheet_period.week_start_date),
      approvedBy: approval?.name ?? null,
      approvedAt: approval?.at ?? null,
    };
  });

  return { rows, truncated };
}

