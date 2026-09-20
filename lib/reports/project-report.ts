import "server-only";

import type { Prisma } from "@prisma/client";

import { getReviewableProfileIds, isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly, decimal } from "@/lib/timesheets/queries";
import type { DateStr } from "@/lib/timesheets/week";
import { REPORT_STATUS_PRESETS, type ReportStatusPreset } from "./queries";
import { resolvePeriod, type PeriodType, type ResolvedPeriod } from "./period";
import type { TimesheetStatus } from "@/types/domain";

// Period resolution is shared with the week-first main report — see lib/reports/period.ts.
export type ProjectPeriodType = PeriodType;
export type ProjectPeriod = ResolvedPeriod;

export function resolveProjectPeriod(type: ProjectPeriodType, anchor: DateStr): ProjectPeriod {
  return resolvePeriod(type, anchor);
}

/** Projects the viewer is allowed to report on (admin: all active; manager: led/managed) within the org. */
export async function getScopedProjects(
  viewer: CurrentUser,
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  if (isAdmin(viewer.role)) {
    return prisma.projects.findMany({
      where: { is_active: true, organization_id: organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  if (!viewer.profile) return [];
  return prisma.projects.findMany({
    where: {
      is_active: true,
      organization_id: organizationId,
      project_assignments: {
        some: {
          employee_profile_id: viewer.profile.id,
          organization_id: organizationId,
          is_active: true,
          assignment_role: { in: ["lead", "manager"] },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function assertProjectInScope(
  viewer: CurrentUser,
  projectId: string,
  organizationId: string,
): Promise<{ id: string; name: string } | null> {
  const allowed = await getScopedProjects(viewer, organizationId);
  return allowed.find((p) => p.id === projectId) ?? null;
}

function statusesFor(preset: ReportStatusPreset | undefined): TimesheetStatus[] {
  const key = preset && preset in REPORT_STATUS_PRESETS ? preset : "all";
  return REPORT_STATUS_PRESETS[key] as TimesheetStatus[];
}

export type Breakdown = { id: string; label: string; hours: number };
export type EmployeeDrill = {
  id: string;
  name: string;
  totalHours: number;
  byActivity: Breakdown[];
  byPlatform: Breakdown[];
  daily: { date: DateStr; hours: number }[];
};
export type ProjectDetailRow = {
  id: string;
  date: DateStr;
  employee: string;
  platform: string;
  workType: string;
  hours: number;
  description: string;
  status: TimesheetStatus;
};

export type ProjectReport = {
  project: { id: string; name: string };
  period: ProjectPeriod;
  statusPreset: ReportStatusPreset;
  totalHours: number;
  approvedHours: number;
  billableHours: number;
  nonBillableHours: number;
  employeeCount: number;
  byEmployee: Breakdown[];
  byActivity: Breakdown[];
  byPlatform: Breakdown[];
  employees: EmployeeDrill[];
  detail: ProjectDetailRow[];
};

/**
 * Full project report for a period. Authorization mirrors the rest of Reports:
 * admin = global, manager = only projects they lead/manage and only employees
 * in their review scope. Returns null if the project is out of scope.
 */
export async function getProjectReport(
  viewer: CurrentUser,
  input: { projectId: string; period: ProjectPeriod; statusPreset?: ReportStatusPreset; organizationId: string },
): Promise<ProjectReport | null> {
  const project = await assertProjectInScope(viewer, input.projectId, input.organizationId);
  if (!project) return null;

  const statuses = statusesFor(input.statusPreset);
  const scopeIds = isAdmin(viewer.role) ? null : await getReviewableProfileIds(viewer, input.organizationId);

  const rangeWhere: Prisma.time_entriesWhereInput = {
    organization_id: input.organizationId,
    project_id: input.projectId,
    entry_date: { gte: dateInput(input.period.start), lte: dateInput(input.period.end) },
    ...(scopeIds ? { employee_profile_id: { in: scopeIds } } : {}),
  };
  const where: Prisma.time_entriesWhereInput = { ...rangeWhere, timesheet_period: { status: { in: statuses } } };

  const [total, approved, billable, byEmployeeRaw, byActivityRaw, byPlatformRaw, empActivityRaw, empPlatformRaw, empDailyRaw, detailRows] =
    await Promise.all([
      prisma.time_entries.aggregate({ where, _sum: { hours: true } }),
      prisma.time_entries.aggregate({
        where: { ...rangeWhere, timesheet_period: { status: "approved" } },
        _sum: { hours: true },
      }),
      prisma.time_entries.aggregate({ where: { ...where, activity_type: { is_billable: true } }, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["employee_profile_id"], where, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["activity_type_id"], where, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["platform_id"], where, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["employee_profile_id", "activity_type_id"], where, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["employee_profile_id", "platform_id"], where, _sum: { hours: true } }),
      prisma.time_entries.groupBy({ by: ["employee_profile_id", "entry_date"], where, _sum: { hours: true } }),
      prisma.time_entries.findMany({
        where,
        include: {
          employee_profile: { select: { full_name: true } },
          platform: { select: { name: true } },
          activity_type: { select: { name: true } },
          timesheet_period: { select: { status: true } },
          project_period: { select: { status: true } },
        },
        orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
      }),
    ]);

  // Label maps
  const empIds = byEmployeeRaw.map((r) => r.employee_profile_id);
  const actIds = [...new Set([...byActivityRaw.map((r) => r.activity_type_id), ...empActivityRaw.map((r) => r.activity_type_id)])];
  const platIds = [
    ...new Set(
      [...byPlatformRaw.map((r) => r.platform_id), ...empPlatformRaw.map((r) => r.platform_id)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  const [empRows, actRows, platRows] = await Promise.all([
    empIds.length ? prisma.employee_profiles.findMany({ where: { id: { in: empIds } }, select: { id: true, full_name: true } }) : Promise.resolve([]),
    actIds.length ? prisma.activity_types.findMany({ where: { id: { in: actIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    platIds.length ? prisma.platforms.findMany({ where: { id: { in: platIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const empName = new Map(empRows.map((e) => [e.id, e.full_name]));
  const actName = new Map(actRows.map((a) => [a.id, a.name]));
  const platName = new Map(platRows.map((p) => [p.id, p.name]));

  const sum = (v: Prisma.Decimal | null) => (v ? decimal(v) : 0);
  const totalHours = sum(total._sum.hours);
  const billableHours = sum(billable._sum.hours);

  const byEmployee = byEmployeeRaw
    .map((r) => ({ id: r.employee_profile_id, label: empName.get(r.employee_profile_id) ?? "Unknown", hours: sum(r._sum.hours) }))
    .sort((a, b) => b.hours - a.hours);
  const byActivity = byActivityRaw
    .map((r) => ({ id: r.activity_type_id, label: actName.get(r.activity_type_id) ?? "Unknown", hours: sum(r._sum.hours) }))
    .sort((a, b) => b.hours - a.hours);
  const byPlatform = byPlatformRaw
    .map((r) => ({ id: r.platform_id ?? "none", label: r.platform_id ? platName.get(r.platform_id) ?? "Unknown" : "No platform", hours: sum(r._sum.hours) }))
    .sort((a, b) => b.hours - a.hours);

  // Per-employee drill-down
  const drill = new Map<string, EmployeeDrill>();
  const ensureDrill = (id: string): EmployeeDrill => {
    const found = drill.get(id);
    if (found) return found;
    const created: EmployeeDrill = { id, name: empName.get(id) ?? "Unknown", totalHours: 0, byActivity: [], byPlatform: [], daily: [] };
    drill.set(id, created);
    return created;
  };
  for (const r of byEmployeeRaw) ensureDrill(r.employee_profile_id).totalHours = sum(r._sum.hours);
  for (const r of empActivityRaw) {
    const h = sum(r._sum.hours);
    if (h > 0) ensureDrill(r.employee_profile_id).byActivity.push({ id: r.activity_type_id, label: actName.get(r.activity_type_id) ?? "Unknown", hours: h });
  }
  for (const r of empPlatformRaw) {
    const h = sum(r._sum.hours);
    if (h > 0)
      ensureDrill(r.employee_profile_id).byPlatform.push({
        id: r.platform_id ?? "none",
        label: r.platform_id ? platName.get(r.platform_id) ?? "Unknown" : "No platform",
        hours: h,
      });
  }
  for (const r of empDailyRaw) {
    const h = sum(r._sum.hours);
    if (h > 0) ensureDrill(r.employee_profile_id).daily.push({ date: dateOnly(r.entry_date), hours: h });
  }
  const employees = [...drill.values()]
    .map((d) => ({
      ...d,
      byActivity: d.byActivity.sort((a, b) => b.hours - a.hours),
      byPlatform: d.byPlatform.sort((a, b) => b.hours - a.hours),
      daily: d.daily.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const detail: ProjectDetailRow[] = detailRows.map((e) => ({
    id: e.id,
    date: dateOnly(e.entry_date),
    employee: e.employee_profile.full_name,
    platform: e.platform?.name ?? "None",
    workType: e.activity_type.name,
    hours: decimal(e.hours),
    description: e.description,
    // Legacy weekly status; entries on the new operational workflow fall back to
    // "open" until project-report moves to operational periods (MHV-5/9).
    status: e.project_period?.status ?? e.timesheet_period?.status ?? "open",
  }));

  return {
    project,
    period: input.period,
    statusPreset: (input.statusPreset && input.statusPreset in REPORT_STATUS_PRESETS ? input.statusPreset : "all") as ReportStatusPreset,
    totalHours,
    approvedHours: sum(approved._sum.hours),
    billableHours,
    nonBillableHours: Math.max(0, Math.round((totalHours - billableHours) * 100) / 100),
    employeeCount: byEmployee.length,
    byEmployee,
    byActivity,
    byPlatform,
    employees,
    detail,
  };
}
