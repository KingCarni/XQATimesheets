import {
  addDays,
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from "date-fns";

/**
 * Week model. Weeks run Monday → Sunday. Weekends are supported and editable
 * (weekend QA work happens) but carry zero expected hours and are visually
 * de-emphasised in the UI.
 */

export const WEEK_STARTS_ON = 1 as const; // Monday (date-fns convention)
export const WORK_WEEK_DAYS = 5; // Mon–Fri counted toward expected hours

/** A calendar date with no time component, serialised as `yyyy-MM-dd`. */
export type DateStr = string;

export function toDateStr(date: Date): DateStr {
  return format(date, "yyyy-MM-dd");
}

export function fromDateStr(value: DateStr): Date {
  return parseISO(value);
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

export type WeekRange = {
  start: DateStr;
  end: DateStr;
  /** The seven dates Mon…Sun. */
  days: DateStr[];
};

export function getWeekRange(within: DateStr | Date): WeekRange {
  const base = typeof within === "string" ? fromDateStr(within) : within;
  const start = startOfWeek(base, { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(base, { weekStartsOn: WEEK_STARTS_ON });
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
  return { start: toDateStr(start), end: toDateStr(end), days };
}

export function shiftWeek(weekStart: DateStr, deltaWeeks: number): DateStr {
  return toDateStr(addDays(fromDateStr(weekStart), deltaWeeks * 7));
}

export function isWeekend(date: DateStr): boolean {
  const day = fromDateStr(date).getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

export function isDateInWeek(date: DateStr, week: WeekRange): boolean {
  return isWithinInterval(fromDateStr(date), {
    start: fromDateStr(week.start),
    end: fromDateStr(week.end),
  });
}

/** Expected hours for a single day: default daily hours on weekdays, 0 on weekends. */
export function expectedHoursForDay(date: DateStr, defaultDailyHours: number): number {
  return isWeekend(date) ? 0 : defaultDailyHours;
}

/** Expected hours for the whole week (weekdays only). */
export function expectedHoursForWeek(defaultDailyHours: number): number {
  return defaultDailyHours * WORK_WEEK_DAYS;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Short weekday label for a date (Mon…Sun). */
export function weekdayLabel(date: DateStr): string {
  return format(fromDateStr(date), "EEE");
}

export function longDayLabel(date: DateStr): string {
  return format(fromDateStr(date), "EEEE, MMM d");
}

export function weekRangeLabel(week: WeekRange): string {
  const start = fromDateStr(week.start);
  const end = fromDateStr(week.end);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

/** Under / exact / over relative to expected. Weekends (expected 0) are neutral. */
export type DayState = "empty" | "under" | "exact" | "over" | "neutral";

export function dayState(logged: number, expected: number): DayState {
  if (expected <= 0) return logged > 0 ? "neutral" : "empty";
  if (logged === 0) return "empty";
  if (logged < expected) return "under";
  if (logged > expected) return "over";
  return "exact";
}
