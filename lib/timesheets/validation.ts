import "server-only";

import { prisma } from "@/lib/prisma";
import type { Row } from "@/types/database";
import {
  getWeekRange,
  isWeekend,
  type DateStr,
} from "./week";
import { dateInput, dateOnly } from "./queries";

export type DayValidationIssue = {
  date: DateStr;
  loggedHours: number;
  ptoHours: number;
  accountedHours: number;
  blocking: boolean;
  message: string;
};

export type WeekSubmissionValidation = {
  ok: boolean;
  loggedHours: number;
  ptoHours: number;
  accountedHours: number;
  errors: DayValidationIssue[];
  warnings: DayValidationIssue[];
};

export async function validateWeekForSubmission(
  profile: Row<"employee_profiles">,
  weekStart: DateStr,
): Promise<WeekSubmissionValidation> {
  const week = getWeekRange(weekStart);

  const entries = await prisma.time_entries.findMany({
    where: {
      employee_profile_id: profile.id,
      entry_date: {
        gte: dateInput(week.start),
        lte: dateInput(week.end),
      },
    },
    select: {
      entry_date: true,
      hours: true,
    },
  });

  const ptoRequests = await prisma.pto_requests.findMany({
    where: {
      employee_profile_id: profile.id,
      status: "approved",
      start_date: {
        lte: dateInput(week.end),
      },
      end_date: {
        gte: dateInput(week.start),
      },
    },
    select: {
      start_date: true,
      end_date: true,
      hours_per_day: true,
    },
  });

  const loggedByDate = new Map<DateStr, number>();

  for (const entry of entries) {
    const date = dateOnly(entry.entry_date);

    loggedByDate.set(
      date,
      (loggedByDate.get(date) ?? 0) + entry.hours.toNumber(),
    );
  }

  const ptoByDate = new Map<DateStr, number>();

  for (const request of ptoRequests) {
    for (const day of week.days) {
      const date = dateInput(day);

      if (
        date >= request.start_date &&
        date <= request.end_date
      ) {
        ptoByDate.set(
          day,
          (ptoByDate.get(day) ?? 0) +
            request.hours_per_day.toNumber(),
        );
      }
    }
  }

  const errors: DayValidationIssue[] = [];
  const warnings: DayValidationIssue[] = [];

  let loggedHours = 0;
  let ptoHours = 0;

  for (const day of week.days) {
    const logged = loggedByDate.get(day) ?? 0;
    const pto = ptoByDate.get(day) ?? 0;
    const accounted = logged + pto;

    loggedHours += logged;
    ptoHours += pto;

    if (isWeekend(day) && logged > 0) {
      warnings.push({
        date: day,
        loggedHours: logged,
        ptoHours: pto,
        accountedHours: accounted,
        blocking: false,
        message: `${day} has weekend hours.`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    loggedHours,
    ptoHours,
    accountedHours: loggedHours + ptoHours,
    errors,
    warnings,
  };
}
