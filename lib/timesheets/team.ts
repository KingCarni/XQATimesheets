import "server-only";

import { getReviewableProfileIds } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { dateInput, dateOnly } from "./queries";
import { getWeekRange, type DateStr } from "./week";

export async function getTeamOverview(viewer: CurrentUser, weekStart: DateStr) {
  const week = getWeekRange(weekStart);
  const reviewableIds = await getReviewableProfileIds(viewer);
  const profiles = await prisma.employee_profiles.findMany({
    where: reviewableIds ? { id: { in: reviewableIds } } : {},
    include: {
      user: true,
      project_assignments: {
        where: { is_active: true },
        include: { project: true },
      },
      timesheet_periods: {
        where: { week_start_date: dateInput(week.start) },
      },
      time_entries: {
        where: {
          entry_date: { gte: dateInput(week.start), lte: dateInput(week.end) },
        },
      },
    },
    orderBy: { full_name: "asc" },
  });

  return profiles.map((profile) => {
    const totals = new Map(week.days.map((day) => [day, 0]));
    for (const entry of profile.time_entries) {
      const day = dateOnly(entry.entry_date);
      totals.set(day, (totals.get(day) ?? 0) + entry.hours.toNumber());
    }

    const workdays = week.days.slice(0, 5).map((day) => ({ day, total: totals.get(day) ?? 0 }));

    return {
      id: profile.id,
      employee: profile.full_name,
      email: profile.user.email,
      projects: profile.project_assignments.map((a) => a.project.name),
      status: profile.timesheet_periods[0]?.status ?? "open",
      total: [...totals.values()].reduce((sum, value) => sum + value, 0),
      workdays,
    };
  });
}
