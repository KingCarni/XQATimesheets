/**
 * MHV-11 — canonical row-completeness rules for a time entry.
 *
 * ONE rule set is reused by every path that touches an entry:
 *   - Add Entry (server action)                  — reject at creation.
 *   - Edit Entry / autosave (server action)      — reject at persistence.
 *   - Submit Project Period                      — reject the whole submit
 *     when ANY entry in the period is incomplete (never partial-submit).
 *   - Submit General Week                        — same rule for legacy weekly.
 *   - UI (client)                                — surface a per-field message.
 *
 * The rules are PURE over a small shape so they are trivially unit-testable
 * and cannot drift between add / edit / submit code paths. Field IDs match
 * the form/UI names.
 */

export type EntryValidationField = "hours" | "activityTypeId" | "platformId" | "entryDate";

export type EntryValidationIssue = {
  field: EntryValidationField;
  message: string;
};

export type EntryValidationResult =
  | { ok: true; issues: [] }
  | { ok: false; issues: EntryValidationIssue[] };

/** Minimal shape needed to judge completeness. Project may be null (General). */
export type ValidatableEntry = {
  entryDate: string | null | undefined;
  hours: number | string | null | undefined;
  activityTypeId: string | null | undefined;
  projectId: string | null | undefined;
  platformId: string | null | undefined;
};

/** Project completeness context — only `requiresPlatform` is consulted here. */
export type ValidatableProject = { requiresPlatform: boolean } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function numHours(h: number | string | null | undefined): number | null {
  if (h === null || h === undefined || h === "") return null;
  const n = typeof h === "number" ? h : Number(h);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate a single entry against the MHV-11 completeness rules.
 *
 * Required (all entries):     entryDate, hours > 0, activityTypeId.
 * Required (project entries): platformId IFF project.requiresPlatform.
 *                             project.requiresPlatform === false → platform optional.
 * General (no-project) entries: never require a platform (there is no project
 *                               to consult; General remains legitimate).
 *
 * Description is NOT required by the current domain and is not made required here.
 * No target-hours / filler rules — MHV-11 is row completeness, not employee load.
 */
export function validateEntryCompleteness(
  entry: ValidatableEntry,
  project: ValidatableProject,
): EntryValidationResult {
  const issues: EntryValidationIssue[] = [];

  if (!entry.entryDate || !DATE_RE.test(entry.entryDate)) {
    issues.push({ field: "entryDate", message: "Entry date is required." });
  }

  const hours = numHours(entry.hours);
  if (hours === null) {
    issues.push({ field: "hours", message: "Enter hours." });
  } else if (hours <= 0) {
    issues.push({ field: "hours", message: "Hours must be greater than 0." });
  } else if (hours > 24) {
    issues.push({ field: "hours", message: "Hours cannot exceed 24." });
  }

  if (!entry.activityTypeId) {
    issues.push({ field: "activityTypeId", message: "Work type is required." });
  }

  if (entry.projectId && project?.requiresPlatform && !entry.platformId) {
    issues.push({ field: "platformId", message: "Platform is required for this project." });
  }

  return issues.length === 0
    ? { ok: true, issues: [] }
    : { ok: false, issues };
}

/**
 * Reduce a list of issues to a single, actionable string. Used when a caller
 * needs one line (server-action error, submit-block message). Prefers the
 * highest-signal message rather than concatenating everything.
 */
export function firstIssueMessage(result: EntryValidationResult): string | null {
  return result.ok ? null : result.issues[0]?.message ?? "Entry is incomplete.";
}

// ---------------------------------------------------------------------------
// MHV-11 submission-block reducer — the shared row-list version of the rule
// above. Lives in this file so it stays a single-import "leaf" module the
// `node --test` runner can load without any peer file resolution quirks.
// ---------------------------------------------------------------------------

export type EntryRowForCompleteness = {
  entryId: string;
  entryDate: string;
  hours: number | string;
  activityTypeId: string | null;
  projectId: string | null;
  platformId: string | null;
  /** null → General (no-project); otherwise the project's platform requirement. */
  project: { requiresPlatform: boolean } | null;
};

export type IncompleteEntry = {
  entryId: string;
  entryDate: string;
  issue: EntryValidationIssue;
};

export type PeriodCompletenessResult = {
  ok: boolean;
  entryCount: number;
  incomplete: IncompleteEntry[];
  /** One-line summary suitable for a server-action error. */
  summary: string | null;
};

/**
 * "date: message (+N more entries need attention)" — deterministic: anchored on
 * the first failing entry's first issue, with a stable count of remaining
 * issues. Grammar switches to singular when exactly one other issue remains.
 */
export function summarizeIncomplete(incomplete: readonly IncompleteEntry[]): string | null {
  if (incomplete.length === 0) return null;
  const first = incomplete[0];
  const rest = incomplete.length - 1;
  const base = `${first.entryDate}: ${first.issue.message}`;
  if (rest === 0) return base;
  const noun = rest === 1 ? "entry needs" : "entries need";
  return `${base} (+${rest} more ${noun} attention)`;
}

/**
 * Assess every row for MHV-11 completeness. Ordering of the returned issues
 * follows the input row order, then the field order the pure entry validator
 * emits — so callers can rely on the FIRST issue being deterministic (needed
 * for the summary and the server-action error line). Used by the DB shims in
 * `period-completeness.ts` and unit-tested directly.
 */
export function assessEntryRows(rows: readonly EntryRowForCompleteness[]): PeriodCompletenessResult {
  const incomplete: IncompleteEntry[] = [];
  for (const r of rows) {
    const result = validateEntryCompleteness(
      {
        entryDate: r.entryDate,
        hours: r.hours,
        activityTypeId: r.activityTypeId,
        projectId: r.projectId,
        platformId: r.platformId,
      },
      r.project,
    );
    if (!result.ok) {
      for (const issue of result.issues) {
        incomplete.push({ entryId: r.entryId, entryDate: r.entryDate, issue });
      }
    }
  }
  return {
    ok: incomplete.length === 0,
    entryCount: rows.length,
    incomplete,
    summary: summarizeIncomplete(incomplete),
  };
}
