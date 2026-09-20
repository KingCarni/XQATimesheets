/**
 * Pure period-scoped total helpers for My Timesheet.
 *
 * The client card owns three totals — Day, Week, Pay Period — and QA turned up
 * a class of bug where a card retained totals from a previously-shown period.
 * These helpers pin every total to the specific (project, period, date) the UI
 * is showing right now, so a stale entry set can never contribute to the wrong
 * period's total. They are pure over already-scoped inputs (the server hands
 * the client only the entries within the selected period), which makes them
 * cheap to unit test and impossible to accidentally mix across periods.
 */
import { addDays, format, parseISO } from "date-fns";

/** A calendar date with no time component, serialised as `yyyy-MM-dd`. */
export type DateStr = string;

type SummaryEntry = { entry_date: DateStr; hours: number | string };

const toNum = (h: number | string): number => (typeof h === "number" ? h : Number(h));

/** Sum of entry.hours for entries whose entry_date is in [start, end]. */
export function sumHoursInRange(
  entries: readonly SummaryEntry[],
  start: DateStr,
  end: DateStr,
): number {
  let total = 0;
  for (const e of entries) {
    if (e.entry_date >= start && e.entry_date <= end) total += toNum(e.hours);
  }
  return total;
}

/** Day total: entries.hours where entry_date === date. */
export function dayTotal(entries: readonly SummaryEntry[], date: DateStr): number {
  return sumHoursInRange(entries, date, date);
}

/** Every calendar day in [start, end] inclusive, as `yyyy-MM-dd` strings. */
export function listPeriodDays(start: DateStr, end: DateStr): DateStr[] {
  const days: DateStr[] = [];
  const endDate = parseISO(end);
  let cursor = parseISO(start);
  while (cursor.getTime() <= endDate.getTime()) {
    days.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Break [start, end] into contiguous visual rows of at most `size` days,
 * anchored to the ACTUAL PERIOD START (never Monday). This is what the UI
 * renders as a "week row" — weekly = 1 row × 7 cells, biweekly = 2 rows × 7,
 * monthly/semi-monthly = as many rows as needed with a possibly-short final
 * row. No day outside [start, end] is ever produced.
 */
export function chunkPeriodDays(
  start: DateStr,
  end: DateStr,
  size = 7,
): DateStr[][] {
  if (size < 1) throw new Error("chunkPeriodDays: size must be >= 1");
  const days = listPeriodDays(start, end);
  const rows: DateStr[][] = [];
  for (let i = 0; i < days.length; i += size) rows.push(days.slice(i, i + size));
  return rows;
}

/**
 * The visual "week" (period-anchored 7-day chunk) that contains `date`. This
 * is NOT a Monday–Sunday calendar week: it is the row of the day grid the UI
 * renders for this period, so clicking any day in row 1 of a biweekly Thu→Wed
 * period yields the same visual-week range as clicking any other day in row 1.
 * Falls back to [periodStart, periodStart] if `date` sits outside the period.
 */
export function visualWeekForDate(
  date: DateStr,
  periodStart: DateStr,
  periodEnd: DateStr,
  size = 7,
): { start: DateStr; end: DateStr } {
  const rows = chunkPeriodDays(periodStart, periodEnd, size);
  for (const row of rows) {
    if (row.length && date >= row[0] && date <= row[row.length - 1]) {
      return { start: row[0], end: row[row.length - 1] };
    }
  }
  return { start: periodStart, end: periodStart };
}

/**
 * Week total for the visual row containing `date` — the sum of the project's
 * entries in the period-anchored 7-day chunk that day sits in. Bug-2 defense:
 * clipped by [periodStart, periodEnd], so a chunk on the final short row of a
 * monthly period cannot bleed past the period end.
 */
export function weekTotalForPeriod(
  entries: readonly SummaryEntry[],
  date: DateStr,
  periodStart: DateStr,
  periodEnd: DateStr,
  size = 7,
): number {
  const { start, end } = visualWeekForDate(date, periodStart, periodEnd, size);
  return sumHoursInRange(entries, start, end);
}

/** Pay-period total: sums entries across [periodStart, periodEnd]. */
export function periodTotal(
  entries: readonly SummaryEntry[],
  periodStart: DateStr,
  periodEnd: DateStr,
): number {
  return sumHoursInRange(entries, periodStart, periodEnd);
}

/**
 * Normalize a selected day to the currently-shown period: any date outside
 * [periodStart, periodEnd] resolves to the period start. Used to guarantee
 * "selected Day inside period" after Prev/Current/Next navigation.
 */
export function normalizeSelectedDay(
  candidate: DateStr | undefined | null,
  periodStart: DateStr,
  periodEnd: DateStr,
  today: DateStr,
): DateStr {
  if (candidate && candidate >= periodStart && candidate <= periodEnd) return candidate;
  if (today >= periodStart && today <= periodEnd) return today;
  return periodStart;
}

/** Add days to a `yyyy-MM-dd` date, returning `yyyy-MM-dd`. */
export function shiftDay(date: DateStr, days: number): DateStr {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}
