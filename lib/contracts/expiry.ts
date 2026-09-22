/**
 * MHV-13 pure helpers for contract expiry derivation + warning-window
 * validation. No `server-only`, no Prisma import — so `node --test` can
 * exercise these directly on plain .ts files.
 *
 * Expiry is a purely date-domain concept: everything below operates on
 * `yyyy-MM-dd` strings and never crosses a wall-clock/tz boundary. The DB
 * side supplies today's date in the organization's local timezone.
 */

export type ExpiryState = "active" | "expiring_soon" | "expired" | "no_end_date";

export type ExpiryWarningPolicy = {
  /** 0..365; NULL disables warnings for this tenant. */
  warningDays: number | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole-day difference between two `yyyy-MM-dd` strings, using UTC math. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const [ya, ma, da] = fromYmd.split("-").map(Number);
  const [yb, mb, db] = toYmd.split("-").map(Number);
  const ms = Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da);
  return Math.floor(ms / 86_400_000);
}

export function isValidExpiryWarningDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 365;
}

/**
 * Parse a form-input warning-days value. Empty/nullish → null (disabled);
 * otherwise a number in 0..365 is required.
 */
export function parseExpiryWarningDaysInput(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!isValidExpiryWarningDays(n)) {
    throw new Error("Warning window must be a whole number of days between 0 and 365.");
  }
  return n;
}

/**
 * Derive a display-only expiry state. Never mutates stored `contract_status`
 * (see MHV-13 spec: "Do NOT mutate contract status just because a date
 * approaches"). Contracts without an end date are `no_end_date` regardless of
 * status. Terminated/expired STORED statuses still get a derived state so the
 * UI can badge them consistently.
 */
export function deriveExpiryState(opts: {
  endDate: string | null;
  todayYmd: string;
  policy: ExpiryWarningPolicy;
}): { state: ExpiryState; daysUntilExpiry: number | null } {
  const { endDate, todayYmd, policy } = opts;
  if (!endDate) return { state: "no_end_date", daysUntilExpiry: null };
  if (!DATE_RE.test(endDate) || !DATE_RE.test(todayYmd)) {
    return { state: "no_end_date", daysUntilExpiry: null };
  }
  const daysUntilExpiry = daysBetween(todayYmd, endDate);
  if (daysUntilExpiry < 0) return { state: "expired", daysUntilExpiry };
  if (policy.warningDays !== null && daysUntilExpiry <= policy.warningDays) {
    return { state: "expiring_soon", daysUntilExpiry };
  }
  return { state: "active", daysUntilExpiry };
}

export const EXPIRY_STATE_LABELS: Record<ExpiryState, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  no_end_date: "No end date",
};
