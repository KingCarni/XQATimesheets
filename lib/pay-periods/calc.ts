/**
 * Pay-period calculation core (MHV-8).
 *
 * Pure, dependency-free calendar-date math. This module intentionally imports
 * nothing (no date-fns, no `@/` aliases, no server-only) so it can be:
 *   - imported by both server and client code, and
 *   - executed directly by `node --test` for deterministic unit tests.
 *
 * IMPORTANT — date semantics
 * --------------------------
 * A pay period is a LOCAL CALENDAR concept in the organization's timezone.
 * We represent every boundary as a `yyyy-MM-dd` string and do all arithmetic in
 * UTC (via `Date.UTC`), which has no DST and exactly 86_400_000 ms/day. Because
 * we only ever read/write the UTC calendar parts, the operating-system / server
 * timezone can never shift a boundary. This matches the app's stored `@db.Date`
 * convention (see `lib/timesheets/queries.ts` `dateInput`/`dateOnly`, which use
 * UTC midnight for date-only columns).
 *
 * The one place "now" enters is `todayInTimeZone`, which resolves the current
 * calendar date in the org's IANA timezone with `Intl` — never the server clock.
 */

/** A calendar date with no time component, `yyyy-MM-dd`. */
export type DateStr = string;

export const PAY_PERIOD_CADENCES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export type Cadence = (typeof PAY_PERIOD_CADENCES)[number];

/**
 * Organization payroll configuration. Discriminated by cadence so only the
 * fields relevant to each cadence exist.
 */
export type PayPeriodConfig =
  | { cadence: "weekly"; startWeekday: number }
  | { cadence: "biweekly"; startWeekday: number; anchor: DateStr }
  | { cadence: "semimonthly"; splitDay: number }
  | { cadence: "monthly"; startDay: number };

/** A resolved pay period. `id` is a stable, URL-friendly identifier (its start date). */
export type PayPeriod = {
  cadence: Cadence;
  start: DateStr;
  end: DateStr;
  id: DateStr;
  label: string;
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** Semi-monthly split day must leave at least one day in the second half. */
export const MIN_SPLIT_DAY = 1;
export const MAX_SPLIT_DAY = 28;
export const DEFAULT_SPLIT_DAY = 15;

/**
 * Monthly start day. Capped at 28 so the boundary date exists in every month
 * (including February) — this avoids ambiguous/clamped 29–31 boundaries. A
 * start day of 1 is the calendar month (1st → last day).
 */
export const MIN_MONTHLY_START_DAY = 1;
export const MAX_MONTHLY_START_DAY = 28;
export const DEFAULT_MONTHLY_START_DAY = 1;

// ---------------------------------------------------------------- date helpers

export function isValidDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= lastDayOfMonth(y, m);
}

function parts(date: DateStr): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function makeStr(y: number, m: number, d: number): DateStr {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

function utcMs(date: DateStr): number {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
}

/** Add (or subtract) whole calendar days. */
export function addDays(date: DateStr, n: number): DateStr {
  const dt = new Date(utcMs(date) + n * MS_PER_DAY);
  return makeStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole-day difference `a - b` (a and b are calendar dates). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((utcMs(a) - utcMs(b)) / MS_PER_DAY);
}

/** Day of week: 0 = Sunday … 6 = Saturday. */
export function weekday(date: DateStr): number {
  return new Date(utcMs(date)).getUTCDay();
}

export function lastDayOfMonth(year: number, month1to12: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Shift a (year, month) pair by whole months, wrapping the year. Month is 1–12. */
function addMonths(year: number, month1to12: number, delta: number): { y: number; m: number } {
  const idx = month1to12 - 1 + delta;
  const y = year + Math.floor(idx / 12);
  const m = ((idx % 12) + 12) % 12 + 1;
  return { y, m };
}

// ------------------------------------------------------------------- labelling

function labelDate(date: DateStr, withYear: boolean): string {
  const { y, m, d } = parts(date);
  return withYear ? `${MONTH_ABBR[m - 1]} ${d}, ${y}` : `${MONTH_ABBR[m - 1]} ${d}`;
}

/**
 * Human label for a period, e.g. "Sep 6 – Sep 19, 2026". When the start and end
 * fall in different years both years are shown ("Dec 28, 2025 – Jan 10, 2026").
 */
export function formatPayPeriodLabel(start: DateStr, end: DateStr): string {
  const sameYear = parts(start).y === parts(end).y;
  return `${labelDate(start, !sameYear)} – ${labelDate(end, true)}`;
}

/** Compact human summary of a config, e.g. "Bi-weekly · Sunday → Saturday" or "Monthly · 26th → 25th". */
export function describeConfig(config: PayPeriodConfig): string {
  switch (config.cadence) {
    case "weekly":
    case "biweekly": {
      const start = WEEKDAY_NAMES[config.startWeekday];
      const end = WEEKDAY_NAMES[effectiveEndWeekday(config.startWeekday)];
      return `${cadenceLabel(config.cadence)} · ${start} → ${end}`;
    }
    case "semimonthly":
      return `Semi-monthly · 1–${config.splitDay}, ${config.splitDay + 1}–end of month`;
    case "monthly":
      if (config.startDay === 1) return "Monthly · calendar month";
      return `Monthly · ${ordinal(config.startDay)} → ${ordinal(config.startDay - 1)} of next month`;
  }
}

/** Short cadence label for UI. */
export function cadenceLabel(cadence: Cadence): string {
  switch (cadence) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Bi-weekly";
    case "semimonthly":
      return "Semi-monthly";
    case "monthly":
      return "Monthly";
  }
}

// ----------------------------------------------------------------- validation

export type ConfigValidation = { ok: true } | { ok: false; error: string };

export function isWeekday(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * Validate a payroll configuration. The most important rule is the biweekly
 * anchor: it MUST fall on the configured start weekday, otherwise cycle
 * boundaries would contradict the "starts on" setting.
 */
export function validatePayPeriodConfig(config: PayPeriodConfig): ConfigValidation {
  switch (config.cadence) {
    case "weekly":
      if (!isWeekday(config.startWeekday)) return { ok: false, error: "Choose a valid start day." };
      return { ok: true };
    case "biweekly": {
      if (!isWeekday(config.startWeekday)) return { ok: false, error: "Choose a valid start day." };
      if (!isValidDateStr(config.anchor)) return { ok: false, error: "Choose a valid anchor date." };
      if (weekday(config.anchor) !== config.startWeekday) {
        return {
          ok: false,
          error: `The anchor date must fall on a ${WEEKDAY_NAMES[config.startWeekday]}.`,
        };
      }
      return { ok: true };
    }
    case "semimonthly":
      if (
        !Number.isInteger(config.splitDay) ||
        config.splitDay < MIN_SPLIT_DAY ||
        config.splitDay > MAX_SPLIT_DAY
      ) {
        return { ok: false, error: `Split day must be between ${MIN_SPLIT_DAY} and ${MAX_SPLIT_DAY}.` };
      }
      return { ok: true };
    case "monthly":
      if (
        !Number.isInteger(config.startDay) ||
        config.startDay < MIN_MONTHLY_START_DAY ||
        config.startDay > MAX_MONTHLY_START_DAY
      ) {
        return {
          ok: false,
          error: `Monthly start day must be between ${MIN_MONTHLY_START_DAY} and ${MAX_MONTHLY_START_DAY}.`,
        };
      }
      return { ok: true };
  }
}

function assertValid(config: PayPeriodConfig): void {
  const result = validatePayPeriodConfig(config);
  if (!result.ok) throw new Error(result.error);
}

/** The effective end weekday derived from a weekly/biweekly start weekday. */
export function effectiveEndWeekday(startWeekday: number): number {
  return (startWeekday + 6) % 7;
}

/** Human ordinal, e.g. 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Human "starts / ends" description for a monthly start day. Start day 1 ends on
 * the last day of the month; any other day ends the day before the next month's
 * boundary.
 */
export function monthlyBoundaryText(startDay: number): { starts: string; ends: string } {
  if (startDay === 1) return { starts: "1st", ends: "last day of the month" };
  return { starts: ordinal(startDay), ends: `${ordinal(startDay - 1)} of the following month` };
}

// --------------------------------------------------------------- core resolver

function build(cadence: Cadence, start: DateStr, end: DateStr): PayPeriod {
  return { cadence, start, end, id: start, label: formatPayPeriodLabel(start, end) };
}

/** Resolve the pay period that CONTAINS the given calendar date. */
export function getPayPeriodForDate(config: PayPeriodConfig, date: DateStr): PayPeriod {
  assertValid(config);
  if (!isValidDateStr(date)) throw new Error(`Invalid date: ${date}`);

  switch (config.cadence) {
    case "weekly": {
      const delta = (weekday(date) - config.startWeekday + 7) % 7;
      const start = addDays(date, -delta);
      return build("weekly", start, addDays(start, 6));
    }
    case "biweekly": {
      // Which 14-day cycle from the anchor does `date` fall in? floor() handles
      // dates before the anchor (negative offsets) correctly.
      const offset = diffDays(date, config.anchor);
      const cycle = Math.floor(offset / 14);
      const start = addDays(config.anchor, cycle * 14);
      return build("biweekly", start, addDays(start, 13));
    }
    case "semimonthly": {
      const { y, m, d } = parts(date);
      if (d <= config.splitDay) {
        return build("semimonthly", makeStr(y, m, 1), makeStr(y, m, config.splitDay));
      }
      return build("semimonthly", makeStr(y, m, config.splitDay + 1), makeStr(y, m, lastDayOfMonth(y, m)));
    }
    case "monthly": {
      const { y, m, d } = parts(date);
      // The period boundary is `startDay` each month. A date on/after the
      // boundary belongs to this month's period; before it, to last month's.
      const base = d >= config.startDay ? { y, m } : addMonths(y, m, -1);
      const start = makeStr(base.y, base.m, config.startDay);
      const next = addMonths(base.y, base.m, 1);
      const end = addDays(makeStr(next.y, next.m, config.startDay), -1);
      return build("monthly", start, end);
    }
  }
}

/** The pay period containing "today" (a calendar date already resolved in the org tz). */
export function getCurrentPayPeriod(config: PayPeriodConfig, today: DateStr): PayPeriod {
  return getPayPeriodForDate(config, today);
}

/** The period immediately before the one containing `reference`. */
export function getPreviousPayPeriod(config: PayPeriodConfig, reference: DateStr | PayPeriod): PayPeriod {
  const current = typeof reference === "string" ? getPayPeriodForDate(config, reference) : reference;
  return getPayPeriodForDate(config, addDays(current.start, -1));
}

/** The period immediately after the one containing `reference`. */
export function getNextPayPeriod(config: PayPeriodConfig, reference: DateStr | PayPeriod): PayPeriod {
  const current = typeof reference === "string" ? getPayPeriodForDate(config, reference) : reference;
  return getPayPeriodForDate(config, addDays(current.end, 1));
}

/**
 * List `count` consecutive pay periods starting with the one containing
 * `fromDate`. `count` may be negative to walk backwards (the returned list is
 * always chronological).
 */
export function listPayPeriods(config: PayPeriodConfig, fromDate: DateStr, count: number): PayPeriod[] {
  const n = Math.abs(count);
  if (n === 0) return [];
  const out: PayPeriod[] = [getPayPeriodForDate(config, fromDate)];
  for (let i = 1; i < n; i++) {
    const step = count >= 0 ? getNextPayPeriod(config, out[out.length - 1]) : getPreviousPayPeriod(config, out[0]);
    if (count >= 0) out.push(step);
    else out.unshift(step);
  }
  return out;
}

/** Stable identifier for a period (its start date). Round-trips via `getPayPeriodForDate`. */
export function payPeriodId(period: PayPeriod): DateStr {
  return period.start;
}

/** Resolve the current calendar date (yyyy-MM-dd) in an IANA timezone, from the real clock. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): DateStr {
  // en-CA formats as yyyy-MM-dd; using formatToParts avoids locale ordering surprises.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ------------------------------------------------- configuration precedence
//
// Pure config resolution kept here (alongside date math, importing nothing) so
// it is unit-testable with `node --test`. The DB/zod bridge lives in config.ts,
// which re-exports these. Precedence: project override → org explicit → legacy.

/** Payroll start weekday used when a tenant has no payroll configuration (Monday). */
export const FALLBACK_START_WEEKDAY = 1;

export type PayPeriodConfigSource = "project" | "organization" | "legacy";

export type EffectivePayPeriodConfig = {
  source: PayPeriodConfigSource;
  config: PayPeriodConfig;
};

/** Stored payroll columns shared by organizations and project overrides. */
export type PayrollColumns = {
  startWeekday: number | null;
  anchor: DateStr | null;
  semimonthlyDay: number | null;
  monthlyStartDay: number | null;
};

export type OrgPayrollRow = { payrollPeriod: Cadence | null } & {
  payrollStartWeekday: number | null;
  payrollAnchorDate: DateStr | null;
  payrollSemimonthlyDay: number | null;
  payrollMonthlyStartDay: number | null;
};

export type ProjectPayrollRow = { payrollPeriodOverride: Cadence | null } & {
  payrollStartWeekday: number | null;
  payrollAnchorDate: DateStr | null;
  payrollSemimonthlyDay: number | null;
  payrollMonthlyStartDay: number | null;
};

function columnsOf(row: {
  payrollStartWeekday: number | null;
  payrollAnchorDate: DateStr | null;
  payrollSemimonthlyDay: number | null;
  payrollMonthlyStartDay: number | null;
}): PayrollColumns {
  return {
    startWeekday: row.payrollStartWeekday,
    anchor: row.payrollAnchorDate,
    semimonthlyDay: row.payrollSemimonthlyDay,
    monthlyStartDay: row.payrollMonthlyStartDay,
  };
}

/**
 * Build a valid, total config from a cadence + stored columns. Never throws:
 * missing optionals use documented defaults; a biweekly cadence with no anchor
 * degrades to weekly on the same start weekday (impossible after validated saves,
 * safe on a read path).
 */
export function buildConfig(cadence: Cadence, cols: PayrollColumns): PayPeriodConfig {
  switch (cadence) {
    case "weekly":
      return { cadence: "weekly", startWeekday: cols.startWeekday ?? FALLBACK_START_WEEKDAY };
    case "biweekly":
      if (!cols.anchor) return { cadence: "weekly", startWeekday: cols.startWeekday ?? FALLBACK_START_WEEKDAY };
      return { cadence: "biweekly", startWeekday: cols.startWeekday ?? FALLBACK_START_WEEKDAY, anchor: cols.anchor };
    case "semimonthly":
      return { cadence: "semimonthly", splitDay: cols.semimonthlyDay ?? DEFAULT_SPLIT_DAY };
    case "monthly":
      return { cadence: "monthly", startDay: cols.monthlyStartDay ?? DEFAULT_MONTHLY_START_DAY };
  }
}

/** Organization-or-legacy config (no project). Legacy = weekly Monday (see config.ts rationale). */
export function resolveOrgPayPeriodConfig(org: OrgPayrollRow): EffectivePayPeriodConfig {
  if (org.payrollPeriod == null) {
    return { source: "legacy", config: { cadence: "weekly", startWeekday: FALLBACK_START_WEEKDAY } };
  }
  return { source: "organization", config: buildConfig(org.payrollPeriod, columnsOf(org)) };
}

/** Backward-compatible: resolve an org row to just a config (applying the legacy fallback). */
export function resolvePayPeriodConfig(org: OrgPayrollRow): PayPeriodConfig {
  return resolveOrgPayPeriodConfig(org).config;
}

/** True when a project defines its own payroll configuration. */
export function hasProjectPayrollOverride(project: Pick<ProjectPayrollRow, "payrollPeriodOverride">): boolean {
  return project.payrollPeriodOverride != null;
}

/** True when the org relies on the legacy fallback (no explicit payroll cadence). */
export function isUsingPayrollFallback(row: Pick<OrgPayrollRow, "payrollPeriod">): boolean {
  return row.payrollPeriod == null;
}

/**
 * Single source of truth for precedence: project override → organization explicit
 * → legacy weekly fallback. Inheritance is dynamic — nothing is copied onto the
 * project, so an inheriting project always reflects the org's current config.
 */
export function resolveEffectivePayPeriodConfig(
  org: OrgPayrollRow,
  project?: ProjectPayrollRow | null,
): EffectivePayPeriodConfig {
  if (project && project.payrollPeriodOverride != null) {
    return { source: "project", config: buildConfig(project.payrollPeriodOverride, columnsOf(project)) };
  }
  return resolveOrgPayPeriodConfig(org);
}

// ------------------------------------------------- editor field ⇆ config mapping
//
// A single, pure source of truth for the cadence editor's form values. Both the
// server view builder and the client `PayPeriodFields` component use these so the
// on-screen controls, derived displays, preview, and persisted config can never
// come from divergent mappings.

/**
 * The editor's field values — a cadence-complete superset covering every cadence.
 * Only the fields relevant to `cadence` are ever read back out (see
 * `fieldValuesToConfig`); the rest are inert carry-over defaults.
 */
export type PayPeriodFieldValues = {
  cadence: Cadence;
  startWeekday: number;
  anchor: DateStr;
  splitDay: number;
  monthlyStartDay: number;
};

/** Seed complete editor field values from any resolved config. */
export function configToFieldValues(config: PayPeriodConfig): PayPeriodFieldValues {
  return {
    cadence: config.cadence,
    startWeekday:
      config.cadence === "weekly" || config.cadence === "biweekly" ? config.startWeekday : FALLBACK_START_WEEKDAY,
    anchor: config.cadence === "biweekly" ? config.anchor : "",
    splitDay: config.cadence === "semimonthly" ? config.splitDay : DEFAULT_SPLIT_DAY,
    monthlyStartDay: config.cadence === "monthly" ? config.startDay : DEFAULT_MONTHLY_START_DAY,
  };
}

/**
 * Build a `PayPeriodConfig` from editor field values, reading ONLY the fields
 * relevant to the chosen cadence. Irrelevant leftover fields (e.g. a biweekly
 * anchor kept in form state after switching to weekly) are ignored, so stale
 * editor state can never affect validation, preview, or persistence.
 */
export function fieldValuesToConfig(v: PayPeriodFieldValues): PayPeriodConfig {
  switch (v.cadence) {
    case "weekly":
      return { cadence: "weekly", startWeekday: v.startWeekday };
    case "biweekly":
      return { cadence: "biweekly", startWeekday: v.startWeekday, anchor: v.anchor };
    case "semimonthly":
      return { cadence: "semimonthly", splitDay: v.splitDay };
    case "monthly":
      return { cadence: "monthly", startDay: v.monthlyStartDay };
  }
}

/** A stable signature of field values, for React keys that must reset editor state. */
export function fieldValuesSignature(v: PayPeriodFieldValues): string {
  return `${v.cadence}|${v.startWeekday}|${v.anchor}|${v.splitDay}|${v.monthlyStartDay}`;
}

// ------------------------------------------- operational submission units (MHV-8 follow-up)
//
// The operational submission unit is the block an employee actually submits and a
// manager actually approves: employee + project + effective pay period. Its
// boundaries are derived PURELY from the project's effective config and the
// entry's own calendar date, then PERSISTED on the workflow row and frozen. This
// function is the single mapping from "an entry's project + date" to "which
// submission block it belongs to"; the server persists/looks up the row keyed by
// (employee, project, start).

/** Resolve the operational pay period an entry belongs to (project config + entry date). */
export function resolveOperationalPeriod(config: PayPeriodConfig, entryDate: DateStr): PayPeriod {
  return getPayPeriodForDate(config, entryDate);
}

/**
 * Whether an entry currently sitting in the period starting `currentStart` should
 * be re-pointed to the freshly resolved `resolvedStart` after a project or date
 * change. Identity is the start date, so any change of start means a different
 * unit. Callers must additionally refuse to move an entry OUT of a frozen
 * (submitted/approved/locked) period — that guard lives with the status rules in
 * `types/domain.ts` (`isPeriodEditable`), not here.
 */
export function operationalPeriodMoved(currentStart: DateStr, resolvedStart: DateStr): boolean {
  return currentStart !== resolvedStart;
}
