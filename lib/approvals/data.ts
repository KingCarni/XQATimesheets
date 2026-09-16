import "server-only";

import { prisma } from "@/lib/prisma";
import { getReviewableProfileIds } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { dateOnly, decimal, timestamp } from "@/lib/timesheets/queries";
import type { PtoStatus, TimesheetStatus } from "@/types/domain";

/* ------------------------------------------------------------------ */
/* Timesheet review details (serializable, for the master/detail pane) */
/* ------------------------------------------------------------------ */

export type ReviewEntryDto = {
  id: string;
  date: string;
  project: string;
  platform: string;
  workType: string;
  hours: number;
  description: string;
};

export type ReviewHistoryDto = {
  id: string;
  action: string;
  actor: string;
  at: string;
  comment: string | null;
};

export type ReviewDetailDto = {
  id: string;
  employeeName: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  status: TimesheetStatus;
  rejectionReason: string | null;
  entries: ReviewEntryDto[];
  history: ReviewHistoryDto[];
};

/**
 * Full serializable review detail for a set of already-authorized periods.
 * The caller passes only period ids that came from `getApprovalQueue` (which
 * is project-scoped), and this re-scopes defensively to the reviewer's
 * reviewable profiles so a forged id can't leak another team's timesheet.
 */
export async function getReviewDetailsMap(
  viewer: CurrentUser,
  periodIds: string[],
  organizationId: string,
): Promise<Record<string, ReviewDetailDto>> {
  if (periodIds.length === 0) return {};
  const reviewableIds = await getReviewableProfileIds(viewer, organizationId);

  const periods = await prisma.timesheet_periods.findMany({
    where: {
      id: { in: periodIds },
      organization_id: organizationId,
      ...(reviewableIds ? { employee_profile_id: { in: reviewableIds } } : {}),
    },
    include: {
      employee_profile: { select: { full_name: true } },
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

  const map: Record<string, ReviewDetailDto> = {};
  for (const period of periods) {
    map[period.id] = {
      id: period.id,
      employeeName: period.employee_profile.full_name,
      weekStart: dateOnly(period.week_start_date),
      weekEnd: dateOnly(period.week_end_date),
      totalHours: decimal(period.total_hours),
      status: period.status,
      rejectionReason: period.rejection_reason,
      entries: period.time_entries.map((entry) => ({
        id: entry.id,
        date: dateOnly(entry.entry_date),
        project: entry.project?.name ?? "No project",
        platform: entry.platform?.name ?? "Any",
        workType: entry.activity_type.name,
        hours: decimal(entry.hours),
        description: entry.description,
      })),
      history: period.approvals.map((a) => ({
        id: a.id,
        action: a.action,
        actor: a.actor.employee_profile?.full_name ?? a.actor.email,
        at: timestamp(a.created_at),
        comment: a.comment,
      })),
    };
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Time-off review, grouped by employee                                */
/* ------------------------------------------------------------------ */

export type TimeOffRequestDto = {
  id: string;
  typeName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  status: PtoStatus;
  notes: string | null;
  reviewNote: string | null;
  approverEmail: string | null;
};

export type TimeOffGroupDto = {
  profileId: string;
  employeeName: string;
  employeeEmail: string;
  pendingCount: number;
  pendingHours: number;
  requests: TimeOffRequestDto[];
};

async function managedProjectIds(user: CurrentUser, organizationId: string): Promise<string[]> {
  if (!user.profile) return [];
  const assignments = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: user.profile.id,
      organization_id: organizationId,
      is_active: true,
      assignment_role: { in: ["lead", "manager"] },
    },
    select: { project_id: true },
  });
  return assignments.map((a) => a.project_id);
}

/**
 * Reviewable time-off requests grouped by employee, scoped exactly like the
 * PTO review model (admin = all; manager = employees on a project they
 * lead/manage). Groups are ordered so those with pending requests come first.
 */
export async function getTimeOffReviewGroups(
  user: CurrentUser,
  organizationId: string,
): Promise<TimeOffGroupDto[]> {
  if (user.role === "employee") return [];

  const where =
    user.role === "admin"
      ? { organization_id: organizationId }
      : {
          organization_id: organizationId,
          employee_profile: {
            project_assignments: {
              some: {
                is_active: true,
                organization_id: organizationId,
                project_id: { in: await managedProjectIds(user, organizationId) },
              },
            },
          },
        };

  const rows = await prisma.pto_requests.findMany({
    where,
    include: {
      activity_type: { select: { name: true } },
      employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
      approver: { select: { email: true } },
    },
    orderBy: [{ start_date: "asc" }, { created_at: "desc" }],
  });

  // Pull the latest decision comment per request from the audit trail so the
  // reviewer can see the note that accompanied an approve/reject.
  const ids = rows.map((r) => r.id);
  const audits = ids.length
    ? await prisma.audit_history.findMany({
        where: {
          entity_type: "pto_request",
          entity_id: { in: ids },
          organization_id: organizationId,
          action: { in: ["approve", "reject"] },
        },
        orderBy: { occurred_at: "desc" },
        select: { entity_id: true, metadata: true },
      })
    : [];
  const reviewNoteById = new Map<string, string>();
  for (const a of audits) {
    if (reviewNoteById.has(a.entity_id)) continue;
    const meta = a.metadata as { comment?: unknown } | null;
    if (meta && typeof meta.comment === "string") reviewNoteById.set(a.entity_id, meta.comment);
  }

  const groups = new Map<string, TimeOffGroupDto>();
  for (const row of rows) {
    const key = row.employee_profile.id;
    let group = groups.get(key);
    if (!group) {
      group = {
        profileId: key,
        employeeName: row.employee_profile.full_name,
        employeeEmail: row.employee_profile.user.email,
        pendingCount: 0,
        pendingHours: 0,
        requests: [],
      };
      groups.set(key, group);
    }
    const totalHours = decimal(row.total_hours);
    if (row.status === "requested") {
      group.pendingCount += 1;
      group.pendingHours += totalHours;
    }
    group.requests.push({
      id: row.id,
      typeName: row.activity_type.name,
      startDate: dateOnly(row.start_date),
      endDate: dateOnly(row.end_date),
      totalHours,
      status: row.status,
      notes: row.notes,
      reviewNote: reviewNoteById.get(row.id) ?? null,
      approverEmail: row.approver?.email ?? null,
    });
  }

  return [...groups.values()].sort(
    (a, b) => b.pendingCount - a.pendingCount || a.employeeName.localeCompare(b.employeeName),
  );
}

/** All time-off types (active + inactive) for the admin management panel. */
export async function getAllTimeOffTypes(organizationId: string) {
  const rows = await prisma.activity_types.findMany({
    where: { is_pto: true, organization_id: organizationId },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, is_active: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, category: r.category, isActive: r.is_active }));
}
