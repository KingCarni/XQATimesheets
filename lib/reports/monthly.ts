import "server-only";

import type { Prisma } from "@prisma/client";

import { isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly, decimal } from "@/lib/timesheets/queries";

import {
  aggregateMonthlyReport,
  buildEmployeeDetail,
  buildMonthlyEntryWhere as buildWhereShape,
  GENERAL_PROJECT_LABEL,
  type MonthlyEmployeeDetail,
  type MonthlyEmployeeRow,
  type MonthlyEntryRow,
  type MonthlyScope,
  type MonthlySummary,
  type MonthRef,
} from "./monthly-shape";

export * from "./monthly-shape";

// ---- authorized scope resolution --------------------------------------------

async function managedProjectIds(viewer: CurrentUser, organizationId: string): Promise<string[]> {
  if (!viewer.profile) return [];
  const rows = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: viewer.profile.id,
      organization_id: organizationId,
      is_active: true,
      assignment_role: { in: ["lead", "manager"] },
    },
    select: { project_id: true },
  });
  return rows.map((r) => r.project_id);
}

export async function resolveMonthlyScope(
  viewer: CurrentUser,
  organizationId: string,
): Promise<MonthlyScope> {
  if (isAdmin(viewer.role)) return { kind: "admin", organizationId };
  const ids = await managedProjectIds(viewer, organizationId);
  return { kind: "manager", organizationId, managedProjectIds: ids };
}

// ---- DB fetch ---------------------------------------------------------------

/**
 * Take the pure WHERE shape and materialise it as a Prisma filter with actual
 * Date objects. The pure helper keeps dates as strings so it stays testable
 * without Prisma types; this seam performs the one-way conversion.
 */
function toPrismaWhere(shape: Record<string, unknown>): Prisma.time_entriesWhereInput {
  const cloned: Record<string, unknown> = { ...shape };
  const ed = cloned.entry_date as { gte?: string; lte?: string } | undefined;
  if (ed && (ed.gte || ed.lte)) {
    cloned.entry_date = {
      ...(ed.gte ? { gte: dateInput(ed.gte) } : {}),
      ...(ed.lte ? { lte: dateInput(ed.lte) } : {}),
    };
  }
  return cloned as Prisma.time_entriesWhereInput;
}

async function fetchMonthlyEntries(
  where: Prisma.time_entriesWhereInput,
): Promise<MonthlyEntryRow[]> {
  const rows = await prisma.time_entries.findMany({
    where,
    include: {
      employee_profile: {
        select: { id: true, full_name: true, user: { select: { email: true } } },
      },
      project: { select: { id: true, name: true } },
      activity_type: { select: { name: true } },
      platform: { select: { name: true } },
    },
    orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
  });
  return rows.map((r) => ({
    entryId: r.id,
    employeeProfileId: r.employee_profile.id,
    employeeName: r.employee_profile.full_name,
    employeeEmail: r.employee_profile.user?.email ?? "",
    date: dateOnly(r.entry_date),
    hours: decimal(r.hours),
    projectId: r.project?.id ?? null,
    projectName: r.project?.name ?? GENERAL_PROJECT_LABEL,
    activity: r.activity_type.name,
    platform: r.platform?.name ?? null,
    description: r.description,
  }));
}

export type MonthlyFilters = {
  month: MonthRef;
  project?: string;
  employeeSearch?: string;
};

export type MonthlyReport = {
  month: MonthRef;
  summary: MonthlySummary;
  employees: MonthlyEmployeeRow[];
  /** Raw, scope-filtered rows — shared between UI aggregation and export so
   * both views see the same authorized data set (no widening on export). */
  rawEntries: MonthlyEntryRow[];
  scope: MonthlyScope;
};

export async function getMonthlyReport(
  viewer: CurrentUser,
  organizationId: string,
  filters: MonthlyFilters,
): Promise<MonthlyReport> {
  const scope = await resolveMonthlyScope(viewer, organizationId);
  const where = toPrismaWhere(buildWhereShape({ scope, ...filters }));
  const rawEntries = await fetchMonthlyEntries(where);
  const { summary, employees } = aggregateMonthlyReport(rawEntries);
  return { month: filters.month, summary, employees, rawEntries, scope };
}

export async function getMonthlyEmployeeDetail(
  viewer: CurrentUser,
  organizationId: string,
  profileId: string,
  filters: MonthlyFilters,
): Promise<MonthlyEmployeeDetail | null> {
  const scope = await resolveMonthlyScope(viewer, organizationId);
  const where = {
    ...toPrismaWhere(buildWhereShape({ scope, ...filters })),
    employee_profile_id: profileId,
  };
  const rawEntries = await fetchMonthlyEntries(where);
  return buildEmployeeDetail(profileId, rawEntries, filters.month);
}

export async function listMonthlyProjectOptions(
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
