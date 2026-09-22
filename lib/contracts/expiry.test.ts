import { test } from "node:test";
import assert from "node:assert/strict";

import {
  daysBetween,
  deriveExpiryState,
  isValidExpiryWarningDays,
  parseExpiryWarningDaysInput,
} from "./expiry.ts";
import { contractDedupeKey } from "../notifications/types.ts";

const today = "2026-09-21";

test("22. active state — end well beyond warning window", () => {
  const r = deriveExpiryState({ endDate: "2027-09-21", todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "active");
  assert.equal(r.daysUntilExpiry, 365);
});

test("23. expiring-soon — end within warning window", () => {
  const r = deriveExpiryState({ endDate: "2026-10-01", todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "expiring_soon");
  assert.equal(r.daysUntilExpiry, 10);
});

test("24. expired — end date past today", () => {
  const r = deriveExpiryState({ endDate: "2026-09-20", todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "expired");
  assert.equal(r.daysUntilExpiry, -1);
});

test("21. no-end-date contract → no_end_date state, always", () => {
  const r = deriveExpiryState({ endDate: null, todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "no_end_date");
  assert.equal(r.daysUntilExpiry, null);
});

test("25. warning window boundary — exactly N days away is expiring_soon", () => {
  const r = deriveExpiryState({ endDate: "2026-10-21", todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "expiring_soon");
  assert.equal(r.daysUntilExpiry, 30);
});

test("warning window boundary + 1 day is active", () => {
  const r = deriveExpiryState({ endDate: "2026-10-22", todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "active");
});

test("today-is-end-date is expiring_soon (not yet expired)", () => {
  const r = deriveExpiryState({ endDate: today, todayYmd: today, policy: { warningDays: 30 } });
  assert.equal(r.state, "expiring_soon");
  assert.equal(r.daysUntilExpiry, 0);
});

test("disabled warning window (null) never emits expiring_soon", () => {
  const soon = deriveExpiryState({ endDate: "2026-09-22", todayYmd: today, policy: { warningDays: null } });
  assert.equal(soon.state, "active");
  const later = deriveExpiryState({ endDate: "2027-09-21", todayYmd: today, policy: { warningDays: null } });
  assert.equal(later.state, "active");
  const past = deriveExpiryState({ endDate: "2026-09-20", todayYmd: today, policy: { warningDays: null } });
  assert.equal(past.state, "expired"); // expired is not gated by policy
});

test("daysBetween UTC math is stable across DST-sensitive dates", () => {
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-11-01", "2026-11-03"), 2);
});

// ---- warning-days validation (test 26) --------------------------------------

test("26. warning config validation — 0 and 365 accepted, integers only", () => {
  assert.equal(isValidExpiryWarningDays(0), true);
  assert.equal(isValidExpiryWarningDays(30), true);
  assert.equal(isValidExpiryWarningDays(365), true);
  assert.equal(isValidExpiryWarningDays(-1), false);
  assert.equal(isValidExpiryWarningDays(366), false);
  assert.equal(isValidExpiryWarningDays(3.5), false);
  assert.equal(isValidExpiryWarningDays("30"), false);
});

test("parseExpiryWarningDaysInput blank clears the setting", () => {
  assert.equal(parseExpiryWarningDaysInput(""), null);
  assert.equal(parseExpiryWarningDaysInput("   "), null);
  assert.equal(parseExpiryWarningDaysInput(null), null);
});

test("parseExpiryWarningDaysInput accepts 0..365", () => {
  assert.equal(parseExpiryWarningDaysInput("30"), 30);
  assert.equal(parseExpiryWarningDaysInput("0"), 0);
  assert.equal(parseExpiryWarningDaysInput("365"), 365);
});

test("parseExpiryWarningDaysInput rejects out-of-range", () => {
  assert.throws(() => parseExpiryWarningDaysInput("-1"));
  assert.throws(() => parseExpiryWarningDaysInput("366"));
  assert.throws(() => parseExpiryWarningDaysInput("abc"));
  assert.throws(() => parseExpiryWarningDaysInput("3.5"));
});

// ---- dedupe key (tests 28/29) -----------------------------------------------

test("28/29. contractDedupeKey format is deterministic per (kind, contractId)", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(contractDedupeKey("contract_expiring", id), `contract_expiring:${id}`);
  assert.equal(contractDedupeKey("contract_expired", id), `contract_expired:${id}`);
  // A second sweep pass produces the same key → the DB partial unique index
  // drops the duplicate insert (see notifications service ON CONFLICT).
  assert.equal(
    contractDedupeKey("contract_expiring", id),
    contractDedupeKey("contract_expiring", id),
  );
});
