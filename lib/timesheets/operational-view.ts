import "server-only";

import { prisma } from "@/lib/prisma";
import type { Row } from "@/types/database";
import { isPeriodEditable, type TimesheetStatus } from "@/types/domain";
import {
  describeConfig,
  getNextPayPeriod,
  getPayPeriodForDate,
  getPreviousPayPeriod,
  isValidDateStr,
  todayInTimeZone,
  type DateStr,
  type PayPeriodConfig,
} from "@/lib/pay-periods/calc";
import { getEffectiveConfigsForProjects } from "@/lib/pay-periods/queries";
import {
  dateInput,
  decimal,
  toActivityTypeRow,
  toEntryRow,
  toPlatformRow,
  toProjectRow,
} from "./queries";
import { getWeekRange, type WeekRange } from "./week";

/**
 * Operational (project-period) My Timesheet data. The screen is grouped by
 * PROJECT PERIOD — each assigned project resolves its own effective pay period,
 * status, entries, totals, and previous/current/next navigation — plus a single
 * legacy "General (no project)" weekly bucket for entries with no project (which
 * remain on the legacy weekly workflow; see the null-project policy).
 *
 * Per-project navigation is independent: `?pp_<projectId>=<yyyy-MM-dd>` selects a
 * date inside the period to show for that one project; the general bucket uses
 * `?gw=<weekStart>`. No single global week selector drives every project.
 */

export type ProjectPeriodNav = {
  previous: DateStr;
  current: DateStr; // the shown period's start (also its id)
  next: DateStr;
  isCurrent: boolean;
};

export type ProjectPeriodSection = {
  projectId: string;
  projectName: string;
  requiresPlatform: boolean;
  cadenceLabel: string;
  source: "project" | "organization" | "legacy";
  periodStart: DateStr;
  periodEnd: DateStr;
  periodLabel: string;
  status: TimesheetStatus;
  editable: boolean;
  totalHours: number;
  entries: Row<"time_entries">[];
  nav: ProjectPeriodNav;
  submittedAt: string | null;
  rejectionReason: string | null;
  /** The persisted operational row id, when one exists yet. */
  projectPeriodId: string | null;
};

export type GeneralSection = {
  week: WeekRange;
  status: TimesheetStatus;
  editable: boolean;
  totalHours: number;
  entries: Row<"time_entries">[];
  submittedAt: string | null;
  rejectionReason: string | null;
  legacyPeriodId: string | null;
};

export type MyTimesheetCatalogs = {
  projects: Row<"projects">[];
  platforms: Row<"platforms">[];
  activityTypes: Row<"activity_types">[];
};

export type MyTimesheetData = {
  today: DateStr;
  projectSections: ProjectPeriodSection[];
  general: GeneralSection;
  catalogs: MyTimesheetCatalogs;
  templates: Row<"entry_templates">[];
};

/** Worst (most restrictive) status among a set — governs a mixed section. */
function worstStatus(statuses: TimesheetStatus[]): TimesheetStatus {
  const rank: Record<TimesheetStatus, number> = {
    open: 0,
    rejected: 1,
    submitted: 2,
    approved: 3,
    locked: 4,
  };
  return statuses.reduce<TimesheetStatus>(
    (best, cur) => (rank[cur] > rank[best] ? cur : best),
    "open",
  );
}

/** Read a per-project selected date param, falling back to `today`. */
function selectedDateFor(projectId: string, params: Record<string, string | undefined>, today: DateStr): DateStr {
  const raw = params[`pp_${projectId}`];
  return raw && isValidDateStr(raw) ? raw : today;
}

function navFor(config: PayPeriodConfig, shownStart: DateStr, today: DateStr): ProjectPeriodNav {
  const shown = getPayPeriodForDate(config, shownStart);
  const current = getPayPeriodForDate(config, today);
  return {
    previous: getPreviousPayPeriod(config, shown).start,
    current: shown.start,
    next: getNextPayPeriod(config, shown).start,
    isCurrent: shown.id === current.id,
  };
}

export async function getMyTimesheetData(
  profile: Row<"employee_profiles">,
  organizationId: string,
  params: Record<string, string | undefined>,
): Promise<MyTimesheetData> {
  // Timezone drives "today"; never the server clock.
  const org = await prisma.organizations.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  const today = todayInTimeZone(org.timezone);

  const [assignments, platforms, activityTypes, templates] = await Promise.all([
    prisma.project_assignments.findMany({
      where: { employee_profile_id: profile.id, organization_id: organizationId, is_active: true },
      select: { project_id: true },
    }),
    prisma.platforms.findMany({
      where: { is_active: true, organization_id: organizationId },
      orderBy: { sort_order: "asc" },
    }),
    prisma.activity_types.findMany({
      where: { is_active: true, organization_id: organizationId },
      orderBy: { sort_order: "asc" },
    }),
    prisma.entry_templates.findMany({
      where: { employee_profile_id: profile.id, organization_id: organizationId, is_active: true },
      orderBy: { sort_order: "asc" },
    }),
  ]);

  const assignedIds = assignments.map((a) => a.project_id);
  const projects = await prisma.projects.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      ...(assignedIds.length ? { id: { in: assignedIds } } : {}),
    },
    orderBy: { name: "asc" },
  });

  const configs = await getEffectiveConfigsForProjects(
    organizationId,
    projects.map((p) => p.id),
  );

  const projectSections: ProjectPeriodSection[] = [];
  for (const project of projects) {
    const resolved = configs.get(project.id);
    if (!resolved) continue;
    const { config, source } = resolved;

    const shown = getPayPeriodForDate(config, selectedDateFor(project.id, params, today));

    const [row, entries] = await Promise.all([
      prisma.project_timesheet_periods.findUnique({
        where: {
          employee_profile_id_project_id_period_start_date: {
            employee_profile_id: profile.id,
            project_id: project.id,
            period_start_date: dateInput(shown.start),
          },
        },
        select: { id: true, status: true, submitted_at: true, rejection_reason: true },
      }),
      prisma.time_entries.findMany({
        where: {
          employee_profile_id: profile.id,
          organization_id: organizationId,
          project_id: project.id,
          entry_date: { gte: dateInput(shown.start), lte: dateInput(shown.end) },
        },
        include: { timesheet_period: { select: { status: true } } },
        orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
      }),
    ]);

    // Split the legacy-period join off each entry, keeping the scalar row for
    // the DTO and the legacy status for the section-status fallback.
    const mapped = entries.map((e) => {
      const { timesheet_period, ...rest } = e;
      return { row: toEntryRow(rest), legacyStatus: timesheet_period?.status ?? null };
    });

    // Status: the operational row if present, else the worst legacy status among
    // any pre-MHV-8 entries sitting in this window (so an already-submitted
    // legacy period is not silently shown as editable).
    const legacyStatuses = mapped
      .map((m) => m.legacyStatus)
      .filter((s): s is TimesheetStatus => Boolean(s));
    const status: TimesheetStatus = row?.status ?? (legacyStatuses.length ? worstStatus(legacyStatuses) : "open");

    projectSections.push({
      projectId: project.id,
      projectName: project.name,
      requiresPlatform: project.requires_platform,
      cadenceLabel: describeConfig(config),
      source,
      periodStart: shown.start,
      periodEnd: shown.end,
      periodLabel: shown.label,
      status,
      editable: isPeriodEditable(status),
      totalHours: mapped.reduce((sum, m) => sum + m.row.hours, 0),
      entries: mapped.map((m) => m.row),
      nav: navFor(config, shown.start, today),
      submittedAt: row?.submitted_at ? row.submitted_at.toISOString() : null,
      rejectionReason: row?.rejection_reason ?? null,
      projectPeriodId: row?.id ?? null,
    });
  }

  // ---- Legacy "General (no project)" weekly bucket ---------------------------
  const gwParam = params.gw;
  const generalWeek = getWeekRange(gwParam && isValidDateStr(gwParam) ? gwParam : today);
  const [legacyPeriod, generalEntries] = await Promise.all([
    prisma.timesheet_periods.findFirst({
      where: {
        employee_profile_id: profile.id,
        organization_id: organizationId,
        week_start_date: dateInput(generalWeek.start),
      },
      select: { id: true, status: true, submitted_at: true, rejection_reason: true },
    }),
    prisma.time_entries.findMany({
      where: {
        employee_profile_id: profile.id,
        organization_id: organizationId,
        project_id: null,
        entry_date: { gte: dateInput(generalWeek.start), lte: dateInput(generalWeek.end) },
      },
      orderBy: [{ entry_date: "asc" }, { created_at: "asc" }],
    }),
  ]);

  const generalStatus: TimesheetStatus = legacyPeriod?.status ?? "open";
  const general: GeneralSection = {
    week: generalWeek,
    status: generalStatus,
    editable: isPeriodEditable(generalStatus),
    totalHours: generalEntries.reduce((sum, e) => sum + decimal(e.hours), 0),
    entries: generalEntries.map(toEntryRow),
    submittedAt: legacyPeriod?.submitted_at ? legacyPeriod.submitted_at.toISOString() : null,
    rejectionReason: legacyPeriod?.rejection_reason ?? null,
    legacyPeriodId: legacyPeriod?.id ?? null,
  };

  return {
    today,
    projectSections,
    general,
    catalogs: {
      projects: projects.map(toProjectRow),
      platforms: platforms.map(toPlatformRow),
      activityTypes: activityTypes.map(toActivityTypeRow),
    },
    templates: templates.map((t) => ({
      ...t,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
    })),
  };
}
