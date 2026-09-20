import "server-only";

import { canReviewProfile, getReviewableProfileIds, isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { encodePeriodRef } from "./period-ref";
import { getWeekRange } from "./week";
import { dateInput, dateOnly, decimal, timestamp } from "./queries";

/** One approval-queue item, unifying operational project periods + legacy weekly. */
export type ApprovalQueueRow = {
  id: string; // composite ref: "project:<id>" | "legacy:<id>"
  employee: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  status: "open" | "submitted" | "approved" | "rejected" | "locked";
  submittedAt: string | null;
  projects: string[];
};

const STATUS_VALUES = ["open", "submitted", "approved", "rejected", "locked"] as const;
type Status = (typeof STATUS_VALUES)[number];

function normalizeStatus(requested: string | undefined): Status | "all" {
  const s = requested || "submitted";
  return (STATUS_VALUES as readonly string[]).includes(s) || s === "all" ? (s as Status | "all") : "submitted";
}

/** Managed project ids for a reviewer (empty for a non-reviewer; use isAdmin for org-wide). */
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

/**
 * The approval queue: operational project periods the reviewer is authorized for
 * (admin = all in org; otherwise projects they lead/manage), plus legacy weekly
 * periods for backward compatibility. Never crosses organizations.
 */
export async function getApprovalQueue(
  viewer: CurrentUser,
  filters: { week?: string; status?: string; employee?: string; project?: string },
  organizationId: string,
): Promise<ApprovalQueueRow[]> {
  const status = normalizeStatus(filters.status);
  const week = filters.week ? getWeekRange(filters.week) : null;
  const admin = isAdmin(viewer.role);

  // ---- Operational project periods -----------------------------------------
  const managedIds = admin ? null : await managedProjectIds(viewer, organizationId);
  const projectScope =
    admin ? {} : { project_id: { in: managedIds && managedIds.length ? managedIds : ["__none__"] } };

  const projectPeriods =
    admin || (managedIds && managedIds.length)
      ? await prisma.project_timesheet_periods.findMany({
          where: {
            organization_id: organizationId,
            ...(status === "all" ? {} : { status }),
            ...projectScope,
            ...(filters.project ? { project_id: filters.project } : {}),
            ...(filters.week ? { period_start_date: dateInput(filters.week) } : {}),
            employee_profile: {
              organization_id: organizationId,
              ...(filters.employee
                ? { full_name: { contains: filters.employee, mode: "insensitive" as const } }
                : {}),
            },
          },
          include: {
            employee_profile: { select: { full_name: true } },
            project: { select: { name: true } },
          },
          orderBy: [{ submitted_at: "asc" }, { updated_at: "desc" }],
        })
      : [];

  // Hours per project period (source of truth = entries; never stored on the row).
  const ppIds = projectPeriods.map((p) => p.id);
  const hoursByPeriod = new Map<string, number>();
  if (ppIds.length) {
    const grouped = await prisma.time_entries.groupBy({
      by: ["project_period_id"],
      where: { project_period_id: { in: ppIds } },
      _sum: { hours: true },
    });
    for (const g of grouped) {
      if (g.project_period_id) hoursByPeriod.set(g.project_period_id, g._sum.hours ? decimal(g._sum.hours) : 0);
    }
  }

  const projectRows: ApprovalQueueRow[] = projectPeriods.map((p) => ({
    id: encodePeriodRef("project", p.id),
    employee: p.employee_profile.full_name,
    weekStart: dateOnly(p.period_start_date),
    weekEnd: dateOnly(p.period_end_date),
    totalHours: hoursByPeriod.get(p.id) ?? 0,
    status: p.status,
    submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
    projects: [p.project.name],
  }));

  // ---- Legacy weekly periods (historical) ----------------------------------
  const reviewableIds = await getReviewableProfileIds(viewer, organizationId);
  const legacyPeriods = await prisma.timesheet_periods.findMany({
    where: {
      organization_id: organizationId,
      ...(status === "all" ? {} : { status }),
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

  const legacyRows: ApprovalQueueRow[] = legacyPeriods.map((p) => ({
    id: encodePeriodRef("legacy", p.id),
    employee: p.employee_profile.full_name,
    weekStart: dateOnly(p.week_start_date),
    weekEnd: dateOnly(p.week_end_date),
    totalHours: decimal(p.total_hours),
    status: p.status,
    submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
    projects: p.employee_profile.project_assignments.map((a) => a.project.name),
  }));

  return [...projectRows, ...legacyRows].sort((a, b) => {
    const at = a.submittedAt ?? "";
    const bt = b.submittedAt ?? "";
    return at.localeCompare(bt);
  });
}

export async function getProjectsForReviewFilters(viewer: CurrentUser, organizationId: string) {
  if (isAdmin(viewer.role)) {
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

/** Single legacy weekly detail (kept for any legacy callers). */
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
