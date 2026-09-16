import "server-only";

import { prisma } from "@/lib/prisma";
import { canReviewProfile, getReviewableProfileIds } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { getWeekRange, type DateStr } from "./week";
import { dateInput, dateOnly, decimal, timestamp } from "./queries";

export async function getApprovalQueue(
  viewer: CurrentUser,
  filters: { week?: DateStr; status?: string; employee?: string; project?: string },
  organizationId: string,
) {
  const week = filters.week ? getWeekRange(filters.week) : null;
  const requestedStatus = filters.status || "submitted";
  const status = ["open", "submitted", "approved", "rejected", "locked", "all"].includes(requestedStatus)
    ? requestedStatus
    : "submitted";
  const reviewableIds = await getReviewableProfileIds(viewer, organizationId);

  return await prisma.timesheet_periods.findMany({
    where: {
      organization_id: organizationId,
      ...(status === "all" ? {} : { status: status as "open" | "submitted" | "approved" | "rejected" | "locked" }),
      ...(week ? { week_start_date: dateInput(week.start) } : {}),
      employee_profile: {
        organization_id: organizationId,
        ...(reviewableIds ? { id: { in: reviewableIds } } : {}),
        ...(filters.employee
          ? { full_name: { contains: filters.employee, mode: "insensitive" as const } }
          : {}),
        ...(filters.project
          ? {
              project_assignments: {
                some: { project_id: filters.project, organization_id: organizationId, is_active: true },
              },
            }
          : {}),
      },
    },
    include: {
      employee_profile: {
        include: {
          project_assignments: {
            where: { is_active: true, organization_id: organizationId },
            include: { project: true },
          },
        },
      },
    },
    orderBy: [{ submitted_at: "asc" }, { updated_at: "desc" }],
  });
}

export async function getReviewDetail(viewer: CurrentUser, periodId: string, organizationId: string) {
  const period = await prisma.timesheet_periods.findFirst({
    where: { id: periodId, organization_id: organizationId },
    include: {
      employee_profile: true,
      time_entries: {
        include: { project: true, platform: true, activity_type: true },
        orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
      },
      approvals: {
        include: { actor: { include: { employee_profile: true } } },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!period) return null;

  const canSee =
    viewer.role === "admin" || (await canReviewProfile(viewer, period.employee_profile_id, organizationId));
  if (!canSee) return null;

  return period;
}

export async function getProjectsForReviewFilters(viewer: CurrentUser, organizationId: string) {
  if (viewer.role === "admin") {
    return prisma.projects.findMany({
      where: { is_active: true, organization_id: organizationId },
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
    orderBy: { name: "asc" },
  });
}

export function periodSummary(period: Awaited<ReturnType<typeof getApprovalQueue>>[number]) {
  return {
    id: period.id,
    employee: period.employee_profile.full_name,
    weekStart: dateOnly(period.week_start_date),
    weekEnd: dateOnly(period.week_end_date),
    totalHours: decimal(period.total_hours),
    status: period.status,
    submittedAt: period.submitted_at ? timestamp(period.submitted_at) : null,
    projects: period.employee_profile.project_assignments.map((a) => a.project.name),
  };
}
