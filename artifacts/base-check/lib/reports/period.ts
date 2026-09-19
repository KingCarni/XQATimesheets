import { getWeekRange, shiftWeek, weekRangeLabel, type DateStr } from "@/lib/timesheets/week";

/**
 * Shared reporting-period model. Reports are week-first: the default period is
 * the current week, using the app's existing Monday–Sunday week definition.
 * Biweekly = the anchor's week plus the following week (two consecutive weeks).
 * No payroll-cycle semantics are assumed.
 *
 * Pure (no DB) so it can be used by pages, the export routes, and the client.
 */
export type PeriodType = "weekly" | "biweekly";

export type ResolvedPeriod = {
  type: PeriodType;
  start: DateStr;
  end: DateStr;
  label: string;
  weeks: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePeriodType(value: string | undefined | null): PeriodType {
  return value === "biweekly" ? "biweekly" : "weekly";
}

/** Anchor date from a param, falling back to today (current week). */
export function normalizeAnchor(value: string | undefined | null): DateStr {
  return value && DATE_RE.test(value) ? value : new Date().toISOString().slice(0, 10);
}

export function resolvePeriod(type: PeriodType, anchor: DateStr): ResolvedPeriod {
  const first = getWeekRange(anchor);
  if (type === "weekly") {
    return { type, start: first.start, end: first.end, label: weekRangeLabel(first), weeks: 1 };
  }
  const second = getWeekRange(shiftWeek(first.start, 1));
  const startLabel = weekRangeLabel(first).split(" – ")[0];
  const endLabel = weekRangeLabel(second).split(" – ")[1];
  return { type, start: first.start, end: second.end, label: `${startLabel} – ${endLabel}`, weeks: 2 };
}

/** Shift the anchor by one whole period (1 week for weekly, 2 for biweekly). */
export function shiftPeriodAnchor(type: PeriodType, anchor: DateStr, direction: 1 | -1): DateStr {
  const weekStart = getWeekRange(anchor).start;
  return shiftWeek(weekStart, direction * (type === "biweekly" ? 2 : 1));
}

/** The anchor for "this week" (today). */
export function currentAnchor(): DateStr {
  return new Date().toISOString().slice(0, 10);
}

export function isCurrentPeriod(type: PeriodType, anchor: DateStr): boolean {
  return resolvePeriod(type, anchor).start === resolvePeriod(type, currentAnchor()).start;
}
