/**
 * MHV-4 submission cutoff policy — pure, timezone-aware, DST-safe.
 *
 * A cutoff is derived per operational pay period: `periodEnd + offsetDays`
 * days, at `timeLocal` (HH:MM) in the organization's IANA timezone. Since
 * cadences and boundaries vary per project, we never hard-code a weekday.
 *
 * Cutoff STATE ("upcoming" / "due_soon" / "overdue" / "not_actionable") is a
 * derivation on top of the operational status — it never mutates
 * `timesheet_status` and never blocks submission. Late submissions remain
 * possible; cutoff is purely operational metadata.
 */
import type { ReviewStatus } from "@/lib/timesheets/team-review-shape";

export type SubmissionCutoffPolicy = {
  enabled: boolean;
  offsetDays: number | null;
  timeLocal: string | null; // "HH:MM"
};

export type CutoffState =
  | "disabled"
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "not_actionable";

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when policy is enabled and both required fields are present + valid. */
export function isCutoffPolicyReady(p: SubmissionCutoffPolicy | null | undefined): p is Required<SubmissionCutoffPolicy> & { offsetDays: number; timeLocal: string } {
  if (!p || !p.enabled) return false;
  if (p.offsetDays === null || p.offsetDays === undefined) return false;
  if (p.offsetDays < 0 || p.offsetDays > 14) return false;
  if (!p.timeLocal || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(p.timeLocal)) return false;
  return true;
}

/**
 * Interpret a YYYY-MM-DD string as a UTC Date at midnight. Prisma `@db.Date`
 * comes in as a Date; we accept both.
 */
function periodEndToYmd(periodEnd: Date | string): { y: number; m: number; d: number } {
  if (typeof periodEnd === "string") {
    const [y, m, d] = periodEnd.split("-").map(Number);
    return { y, m, d };
  }
  return {
    y: periodEnd.getUTCFullYear(),
    m: periodEnd.getUTCMonth() + 1,
    d: periodEnd.getUTCDate(),
  };
}

function addDaysYmd(y: number, m: number, d: number, days: number): { y: number; m: number; d: number } {
  // Use UTC math to add pure calendar days; timezone is applied afterwards.
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * Return the UTC instant that corresponds to `HH:MM` on the given local
 * (y-m-d) date in the given IANA timezone. DST-safe: we compute the zone's
 * offset at that wall-clock moment and correct once (twice near ambiguous
 * spring-forward instants — negligible for a cutoff surface, still correct
 * within one iteration).
 */
export function zonedWallClockToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timezone: string,
): Date {
  // Start with the naive UTC guess.
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = tzOffsetMs(guess, timezone);
  const first = new Date(guess - offset);
  // One correction pass to settle DST transitions.
  const offset2 = tzOffsetMs(first.getTime(), timezone);
  if (offset2 === offset) return first;
  return new Date(guess - offset2);
}

function tzOffsetMs(utcMs: number, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second,
  );
  return asUtc - utcMs;
}

/**
 * Compute the submission cutoff instant for an operational period.
 * Returns null when policy is disabled/incomplete.
 */
export function getSubmissionCutoff(
  periodEnd: Date | string,
  policy: SubmissionCutoffPolicy,
  timezone: string,
): Date | null {
  if (!isCutoffPolicyReady(policy)) return null;
  const { y, m, d } = periodEndToYmd(periodEnd);
  const shifted = addDaysYmd(y, m, d, policy.offsetDays);
  const [hh, mm] = policy.timeLocal.split(":").map(Number);
  return zonedWallClockToUtc(shifted.y, shifted.m, shifted.d, hh, mm, timezone);
}

/**
 * Derive the display/reminder state.
 *
 * - `disabled` / null cutoff: nothing to show.
 * - `complete`: approved or locked — nothing further is required.
 * - `submitted` after cutoff: NOT employee-overdue; caller may render
 *   "awaiting review" separately, but this function returns `upcoming`
 *   for anything still-in-flight before cutoff and `complete` when
 *   already submitted (submission satisfies the employee side of the
 *   cutoff obligation).
 * - `open`/`rejected` past cutoff: `overdue`.
 * - within 24h of cutoff and requires action: `due_soon`.
 */
export function getCutoffState(
  now: Date,
  cutoff: Date | null,
  status: ReviewStatus | "open" | "submitted" | "approved" | "rejected" | "locked",
): CutoffState {
  if (!cutoff) return "disabled";
  if (status === "approved" || status === "locked") return "not_actionable";
  if (status === "submitted") return "not_actionable";
  const delta = cutoff.getTime() - now.getTime();
  if (delta <= 0) return "overdue";
  if (delta <= DUE_SOON_WINDOW_MS) return "due_soon";
  return "upcoming";
}

/**
 * Format a cutoff for the org-local wall clock. Returned as a stable short
 * label like "Mon Sep 21 · 12:00 PM". Used by UI surfaces.
 */
export function formatCutoffForOrg(cutoff: Date, timezone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const parts = dtf.formatToParts(cutoff);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${weekday} ${month} ${day} · ${hour}:${minute} ${dayPeriod}`;
}
