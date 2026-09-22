import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/authorization";
import { encodePeriodRef } from "./period-ref";
import { dateInput, dateOnly, decimal, timestamp } from "./queries";
import { chunkPeriodDays } from "./summary";
import {
  filterReviewRows,
  summarizeReviewRows,
  type ReviewExportRow,
  type ReviewFilters,
  type ReviewPeriodRow,
  type ReviewSummary,
  type ReviewStatus,
} from "./team-review-shape";

/**
 * MHV-2 / MHV-9 — DB shim for the Employee Hours Review workspace.
 *
 * Authorization mirrors the approvals queue exactly:
 *   - admin  → every project in the current organization
 *   - manager → only projects they lead/manage (`project_assignments` with
 *               assignment_role in {lead, manager})
 *   - General/no-project bucket → admin ONLY (managers have no project anchor)
 *
 * Nothing here trusts a query-string project id: an "unauthorized" project id
 * from a URL will simply not appear in the reviewer's managed set, so no rows
 * come back. Tenant isolation is enforced by `organization_id` on every
 * where-clause, including on nested employee/project relations.
 *
 * Shaping / filtering / summarizing is delegated to `team-review-shape.ts`
 * (pure, unit-tested) so the same behavior is exercised by the tests as by
 * the workspace at runtime.
 */

export type {
  ReviewExportRow,
  ReviewFilters,
  ReviewPeriodRow,
  ReviewStatus,
  ReviewSummary,
  WorkflowStatusFilter,
} from "./team-review-shape";

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

/** Projects usable in the workspace's project filter — admin: all; manager: managed. */
export async function listReviewFilterProjects(viewer: CurrentUser, organizationId: string) {
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

/**
 * Fetch every authorized (employee × project × operational period) row that
 * INCLUDES the reference date, and every General weekly row that includes it
 * (admin only). Total hours come from `time_entries` aggregates — never from
 * a stored column on the period row — so switching project cadence never
 * skews an in-flight total.
 */
export async function listReviewPeriodRows(
  viewer: CurrentUser,
  organizationId: string,
  filters: ReviewFilters,
): Promise<{ rows: ReviewPeriodRow[]; summary: ReviewSummary }> {
  const admin = isAdmin(viewer.role);
  const managedIds = admin ? null : await managedProjectIds(viewer, organizationId);
  const projectScope =
    admin ? {} : { project_id: { in: managedIds && managedIds.length ? managedIds : ["__none__"] } };

  const ref = filters.referenceDate;

  // Operational (project) periods that contain the reference date.
  const projectPeriods =
    admin || (managedIds && managedIds.length)
      ? await prisma.project_timesheet_periods.findMany({
          where: {
            organization_id: organizationId,
            ...projectScope,
            period_start_date: { lte: dateInput(ref) },
            period_end_date: { gte: dateInput(ref) },
            employee_profile: { organization_id: organizationId },
          },
          include: {
            employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
            project: { select: { name: true } },
          },
        })
      : [];

  const ppIds = projectPeriods.map((p) => p.id);
  const hoursByPeriod = new Map<string, number>();
  if (ppIds.length) {
    const grouped = await prisma.time_entries.groupBy({
      by: ["project_period_id"],
      where: { project_period_id: { in: ppIds } },
      _sum: { hours: true },
    });
    for (const g of grouped) {
      if (g.project_period_id) {
        hoursByPeriod.set(g.project_period_id, g._sum.hours ? decimal(g._sum.hours) : 0);
      }
    }
  }

  const projectRows: ReviewPeriodRow[] = projectPeriods.map((p) => ({
    ref: encodePeriodRef("project", p.id),
    employeeProfileId: p.employee_profile.id,
    employeeName: p.employee_profile.full_name,
    employeeEmail: p.employee_profile.user?.email ?? "",
    projectId: p.project_id,
    projectName: p.project.name,
    cadence: describeCadence(p.cadence),
    periodStart: dateOnly(p.period_start_date),
    periodEnd: dateOnly(p.period_end_date),
    totalHours: hoursByPeriod.get(p.id) ?? 0,
    status: p.status as ReviewStatus,
    submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
    rejectionReason: p.rejection_reason,
    isGeneral: false,
  }));

  // General (no-project) weekly rows — admin only.
  let generalRows: ReviewPeriodRow[] = [];
  if (admin) {
    const legacy = await prisma.timesheet_periods.findMany({
      where: {
        organization_id: organizationId,
        week_start_date: { lte: dateInput(ref) },
        week_end_date: { gte: dateInput(ref) },
        // Only legacy periods that hold NON-project entries — otherwise the
        // hours already appear under an operational project row above and
        // would double-count.
        time_entries: { some: { project_id: null } },
      },
      include: {
        employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
      },
    });
    // Sum only the null-project entries — never project-associated ones.
    const legacyIds = legacy.map((p) => p.id);
    const generalHoursByPeriod = new Map<string, number>();
    if (legacyIds.length) {
      const grouped = await prisma.time_entries.groupBy({
        by: ["timesheet_period_id"],
        where: { timesheet_period_id: { in: legacyIds }, project_id: null },
        _sum: { hours: true },
      });
      for (const g of grouped) {
        if (g.timesheet_period_id) {
          generalHoursByPeriod.set(g.timesheet_period_id, g._sum.hours ? decimal(g._sum.hours) : 0);
        }
      }
    }
    generalRows = legacy.map((p) => ({
      ref: encodePeriodRef("legacy", p.id),
      employeeProfileId: p.employee_profile.id,
      employeeName: p.employee_profile.full_name,
      employeeEmail: p.employee_profile.user?.email ?? "",
      projectId: null,
      projectName: "General (no project)",
      cadence: "Weekly",
      periodStart: dateOnly(p.week_start_date),
      periodEnd: dateOnly(p.week_end_date),
      totalHours: generalHoursByPeriod.get(p.id) ?? 0,
      status: p.status as ReviewStatus,
      submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
      rejectionReason: p.rejection_reason,
      isGeneral: true,
    }));
  }

  const combined = [...projectRows, ...generalRows];
  const rows = filterReviewRows(combined, filters);
  const summary = summarizeReviewRows(rows);
  return { rows, summary };
}

/** One review-detail response: the row header + entries grouped by date. */
export type ReviewPeriodDetail = {
  header: ReviewPeriodRow;
  entries: {
    id: string;
    date: string;
    hours: number;
    activityName: string;
    platformName: string;
    description: string;
  }[];
  visualRows: string[][];
};

/**
 * Detail lookup for one review item. Re-verifies authorization on the exact
 * ref (`assertCanReviewPeriodRef` in the caller / here) so a tampered URL id
 * cannot leak another tenant's or another project's data. Entries are the
 * SOURCE `time_entries` for this (employee, project, [start, end]) — never a
 * derived filler row.
 */
export async function getReviewPeriodDetail(
  viewer: CurrentUser,
  organizationId: string,
  ref: string,
): Promise<ReviewPeriodDetail | null> {
  const { kind, id } = decodeRef(ref);
  const admin = isAdmin(viewer.role);

  if (kind === "project") {
    const p = await prisma.project_timesheet_periods.findFirst({
      where: { id, organization_id: organizationId },
      include: {
        employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!p) return null;
    if (!admin) {
      const managed = await managedProjectIds(viewer, organizationId);
      if (!managed.includes(p.project_id)) return null;
    }
    const entries = await prisma.time_entries.findMany({
      where: {
        employee_profile_id: p.employee_profile_id,
        organization_id: organizationId,
        project_id: p.project_id,
        entry_date: { gte: p.period_start_date, lte: p.period_end_date },
      },
      include: {
        activity_type: { select: { name: true } },
        platform: { select: { name: true } },
      },
      orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
    });
    const total = entries.reduce((sum, e) => sum + decimal(e.hours), 0);
    return {
      header: {
        ref: encodePeriodRef("project", p.id),
        employeeProfileId: p.employee_profile.id,
        employeeName: p.employee_profile.full_name,
        employeeEmail: p.employee_profile.user?.email ?? "",
        projectId: p.project_id,
        projectName: p.project.name,
        cadence: describeCadence(p.cadence),
        periodStart: dateOnly(p.period_start_date),
        periodEnd: dateOnly(p.period_end_date),
        totalHours: total,
        status: p.status as ReviewStatus,
        submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
        rejectionReason: p.rejection_reason,
        isGeneral: false,
      },
      entries: entries.map((e) => ({
        id: e.id,
        date: dateOnly(e.entry_date),
        hours: decimal(e.hours),
        activityName: e.activity_type?.name ?? "",
        platformName: e.platform?.name ?? "",
        description: e.description ?? "",
      })),
      visualRows: chunkPeriodDays(dateOnly(p.period_start_date), dateOnly(p.period_end_date), 7),
    };
  }

  // Legacy General weekly — admin only.
  if (!admin) return null;
  const p = await prisma.timesheet_periods.findFirst({
    where: { id, organization_id: organizationId },
    include: {
      employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
    },
  });
  if (!p) return null;
  const entries = await prisma.time_entries.findMany({
    where: {
      employee_profile_id: p.employee_profile_id,
      organization_id: organizationId,
      project_id: null,
      entry_date: { gte: p.week_start_date, lte: p.week_end_date },
    },
    include: {
      activity_type: { select: { name: true } },
      platform: { select: { name: true } },
    },
    orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
  });
  const total = entries.reduce((sum, e) => sum + decimal(e.hours), 0);
  return {
    header: {
      ref: encodePeriodRef("legacy", p.id),
      employeeProfileId: p.employee_profile.id,
      employeeName: p.employee_profile.full_name,
      employeeEmail: p.employee_profile.user?.email ?? "",
      projectId: null,
      projectName: "General (no project)",
      cadence: "Weekly",
      periodStart: dateOnly(p.week_start_date),
      periodEnd: dateOnly(p.week_end_date),
      totalHours: total,
      status: p.status as ReviewStatus,
      submittedAt: p.submitted_at ? timestamp(p.submitted_at) : null,
      rejectionReason: p.rejection_reason,
      isGeneral: true,
    },
    entries: entries.map((e) => ({
      id: e.id,
      date: dateOnly(e.entry_date),
      hours: decimal(e.hours),
      activityName: e.activity_type?.name ?? "",
      platformName: e.platform?.name ?? "",
      description: e.description ?? "",
    })),
    visualRows: chunkPeriodDays(dateOnly(p.week_start_date), dateOnly(p.week_end_date), 7),
  };
}

/** Flat rows for the reviewer export — one row per source time entry. */
export async function getReviewExportRows(
  viewer: CurrentUser,
  organizationId: string,
  filters: ReviewFilters,
): Promise<ReviewExportRow[]> {
  const { rows } = await listReviewPeriodRows(viewer, organizationId, filters);
  if (rows.length === 0) return [];

  // Split into project rows and legacy General rows so we can issue ONE Prisma
  // query per family instead of N+1 detail lookups (previous MHV-9 shape).
  // Every id used here already came from `listReviewPeriodRows`, which is
  // reviewer-scoped, tenant-scoped, and reference-date-filtered — so this batch
  // fetch cannot pull in unauthorized entries.
  const projectRefs = new Map<string, ReviewPeriodRow>(); // project_period_id → row
  const legacyRefs = new Map<string, ReviewPeriodRow>(); // timesheet_period_id → row (General only)
  for (const r of rows) {
    const { kind, id } = decodeRef(r.ref);
    if (kind === "project") projectRefs.set(id, r);
    else legacyRefs.set(id, r);
  }

  const [projectEntries, generalEntries] = await Promise.all([
    projectRefs.size
      ? prisma.time_entries.findMany({
          where: {
            organization_id: organizationId,
            project_period_id: { in: [...projectRefs.keys()] },
          },
          include: {
            activity_type: { select: { name: true } },
            platform: { select: { name: true } },
          },
          orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
        })
      : Promise.resolve([]),
    legacyRefs.size
      ? prisma.time_entries.findMany({
          where: {
            organization_id: organizationId,
            timesheet_period_id: { in: [...legacyRefs.keys()] },
            project_id: null, // General only — never project-associated entries
          },
          include: {
            activity_type: { select: { name: true } },
            platform: { select: { name: true } },
          },
          orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const out: ReviewExportRow[] = [];
  for (const e of projectEntries) {
    const r = e.project_period_id ? projectRefs.get(e.project_period_id) : null;
    if (!r) continue;
    out.push({
      employee: r.employeeName,
      employeeEmail: r.employeeEmail,
      project: r.projectName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      cadence: r.cadence,
      status: r.status,
      entryDate: dateOnly(e.entry_date),
      hours: decimal(e.hours),
      workType: e.activity_type?.name ?? "",
      platform: e.platform?.name ?? "",
      description: e.description ?? "",
      submittedAt: r.submittedAt ?? "",
      rejectionReason: r.rejectionReason ?? "",
    });
  }
  for (const e of generalEntries) {
    const r = e.timesheet_period_id ? legacyRefs.get(e.timesheet_period_id) : null;
    if (!r) continue;
    out.push({
      employee: r.employeeName,
      employeeEmail: r.employeeEmail,
      project: r.projectName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      cadence: r.cadence,
      status: r.status,
      entryDate: dateOnly(e.entry_date),
      hours: decimal(e.hours),
      workType: e.activity_type?.name ?? "",
      platform: e.platform?.name ?? "",
      description: e.description ?? "",
      submittedAt: r.submittedAt ?? "",
      rejectionReason: r.rejectionReason ?? "",
    });
  }
  return out;
}

/**
 * Payroll-oriented rows: same reviewer-scoped list as `listReviewPeriodRows`
 * (no new query path) plus the pure MHV-5 readiness categorization + action
 * item derivation. Used by /reports/payroll and its export.
 */
export async function listPayrollRows(
  viewer: CurrentUser,
  organizationId: string,
  filters: ReviewFilters,
) {
  return listReviewPeriodRows(viewer, organizationId, filters);
}

function decodeRef(ref: string): { kind: "project" | "legacy"; id: string } {
  const idx = ref.indexOf(":");
  if (idx === -1) return { kind: "legacy", id: ref };
  const kind = ref.slice(0, idx);
  return { kind: kind === "project" ? "project" : "legacy", id: ref.slice(idx + 1) };
}

function describeCadence(cadence: string): string {
  switch (cadence) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Biweekly";
    case "semimonthly":
      return "Semi-monthly";
    case "monthly":
      return "Monthly";
    default:
      return cadence.charAt(0).toUpperCase() + cadence.slice(1);
  }
}
