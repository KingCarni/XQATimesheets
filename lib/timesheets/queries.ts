import "server-only";

import type {
  activity_types,
  employee_profiles,
  entry_templates,
  platforms,
  Prisma,
  projects,
  time_entries,
  timesheet_periods,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { Row } from "@/types/database";
import {
  getWeekRange,
  type DateStr,
  type WeekRange,
} from "./week";

export type WeekData = {
  week: WeekRange;
  profile: Row<"employee_profiles">;
  period: Row<"timesheet_periods"> | null;
  entries: Row<"time_entries">[];
  projects: Row<"projects">[];
  platforms: Row<"platforms">[];
  activityTypes: Row<"activity_types">[];
  templates: Row<"entry_templates">[];
};

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function timestamp(value: Date): string {
  return value.toISOString();
}

export function decimal(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function dateInput(value: DateStr): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toEmployeeProfileRow(
  row: employee_profiles,
): Row<"employee_profiles"> {
  return {
    ...row,
    default_daily_hours: decimal(row.default_daily_hours),
    start_date: row.start_date ? dateOnly(row.start_date) : null,
    end_date: row.end_date ? dateOnly(row.end_date) : null,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function toPeriodRow(
  row: timesheet_periods,
): Row<"timesheet_periods"> {
  return {
    ...row,
    week_start_date: dateOnly(row.week_start_date),
    week_end_date: dateOnly(row.week_end_date),
    expected_hours: decimal(row.expected_hours),
    total_hours: decimal(row.total_hours),
    submitted_at: row.submitted_at
      ? timestamp(row.submitted_at)
      : null,
    locked_at: row.locked_at
      ? timestamp(row.locked_at)
      : null,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function toEntryRow(
  row: time_entries,
): Row<"time_entries"> {
  return {
    ...row,
    entry_date: dateOnly(row.entry_date),
    hours: decimal(row.hours),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function toProjectRow(
  row: projects,
): Row<"projects"> {
  return {
    ...row,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function toPlatformRow(
  row: platforms,
): Row<"platforms"> {
  return {
    ...row,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

export function toActivityTypeRow(
  row: activity_types,
): Row<"activity_types"> {
  return {
    ...row,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

function toTemplateRow(
  row: entry_templates,
): Row<"entry_templates"> {
  return {
    ...row,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
  };
}

/**
 * Ensure a timesheet period exists for the given week, creating an `open` one
 * lazily (we don't want empty periods created just by viewing). Safe against a
 * concurrent insert via a re-select on unique violation.
 *
 * `expected_hours` is retained only for database compatibility during this
 * pass. Target hours are no longer part of timesheet behavior.
 */
export async function getOrCreatePeriod(
  profile: Row<"employee_profiles">,
  weekStart: DateStr,
): Promise<Row<"timesheet_periods">> {
  const week = getWeekRange(weekStart);

  const period = await prisma.timesheet_periods.upsert({
    where: {
      employee_profile_id_week_start_date: {
        employee_profile_id: profile.id,
        week_start_date: dateInput(week.start),
      },
    },
    create: {
      employee_profile_id: profile.id,
      week_start_date: dateInput(week.start),
      week_end_date: dateInput(week.end),
      expected_hours: 0,
    },
    update: {},
  });

  return toPeriodRow(period);
}

/** Active projects the employee is assigned to (falls back to all active). */
async function loadProjects(
  profileId: string,
): Promise<Row<"projects">[]> {
  const assignments = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: profileId,
      is_active: true,
    },
    select: {
      project_id: true,
    },
  });

  const ids = assignments.map(
    (assignment) => assignment.project_id,
  );

  const projects = await prisma.projects.findMany({
    where: {
      is_active: true,
      ...(ids.length ? { id: { in: ids } } : {}),
    },
    orderBy: {
      name: "asc",
    },
  });

  return projects.map(toProjectRow);
}

/** Everything the weekly My Timesheet screen needs for one week. */
export async function getWeekData(
  profile: Row<"employee_profiles">,
  weekStart: DateStr,
): Promise<WeekData> {
  const week = getWeekRange(weekStart);

  const [
    period,
    entries,
    projects,
    platforms,
    activityTypes,
    templates,
  ] = await Promise.all([
    prisma.timesheet_periods.findUnique({
      where: {
        employee_profile_id_week_start_date: {
          employee_profile_id: profile.id,
          week_start_date: dateInput(week.start),
        },
      },
    }),

    prisma.time_entries.findMany({
      where: {
        employee_profile_id: profile.id,
        entry_date: {
          gte: dateInput(week.start),
          lte: dateInput(week.end),
        },
      },
      orderBy: [
        {
          entry_date: "asc",
        },
        {
          created_at: "asc",
        },
      ],
    }),

    loadProjects(profile.id),

    prisma.platforms.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        sort_order: "asc",
      },
    }),

    prisma.activity_types.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        sort_order: "asc",
      },
    }),

    prisma.entry_templates.findMany({
      where: {
        employee_profile_id: profile.id,
        is_active: true,
      },
      orderBy: {
        sort_order: "asc",
      },
    }),
  ]);

  return {
    week,
    profile,
    period: period ? toPeriodRow(period) : null,
    entries: entries.map(toEntryRow),
    projects,
    platforms: platforms.map(toPlatformRow),
    activityTypes: activityTypes.map(toActivityTypeRow),
    templates: templates.map(toTemplateRow),
  };
}
