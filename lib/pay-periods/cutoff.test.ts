import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getSubmissionCutoff,
  getCutoffState,
  formatCutoffForOrg,
  isCutoffPolicyReady,
} from "./cutoff.ts";

const TZ = "America/Vancouver";
const policy = { enabled: true, offsetDays: 1, timeLocal: "12:00" };

test("disabled policy → no cutoff", () => {
  assert.equal(getSubmissionCutoff("2026-09-20", { enabled: false, offsetDays: 1, timeLocal: "12:00" }, TZ), null);
});

test("missing fields → no cutoff", () => {
  assert.equal(getSubmissionCutoff("2026-09-20", { enabled: true, offsetDays: null, timeLocal: "12:00" }, TZ), null);
  assert.equal(getSubmissionCutoff("2026-09-20", { enabled: true, offsetDays: 1, timeLocal: null }, TZ), null);
});

test("offset 0 → same calendar date as period end", () => {
  const cutoff = getSubmissionCutoff("2026-09-20", { enabled: true, offsetDays: 0, timeLocal: "17:00" }, TZ);
  // Vancouver 17:00 PDT (UTC-7) → 24:00 UTC on same date.
  assert.equal(new Date(cutoff!).toISOString(), "2026-09-21T00:00:00.000Z");
});

test("offset 1 crosses month boundary", () => {
  const cutoff = getSubmissionCutoff("2026-09-30", policy, TZ)!;
  const label = formatCutoffForOrg(cutoff, TZ);
  assert.ok(label.includes("Oct"), label);
});

test("offset crosses year boundary", () => {
  const cutoff = getSubmissionCutoff("2026-12-31", { enabled: true, offsetDays: 1, timeLocal: "09:00" }, TZ)!;
  const label = formatCutoffForOrg(cutoff, TZ);
  assert.ok(label.includes("Jan"), label);
});

test("org timezone respected — East vs West", () => {
  const west = getSubmissionCutoff("2026-09-20", policy, "America/Vancouver")!;
  const east = getSubmissionCutoff("2026-09-20", policy, "America/New_York")!;
  // Same wall clock 12:00 local; east is 3 hours earlier in UTC than west.
  assert.equal(west.getTime() - east.getTime(), 3 * 60 * 60 * 1000);
});

test("DST spring-forward safe (Vancouver 2027-03-14 has no 02:30)", () => {
  const cutoff = getSubmissionCutoff("2027-03-13", { enabled: true, offsetDays: 1, timeLocal: "02:30" }, TZ)!;
  const label = formatCutoffForOrg(cutoff, TZ);
  // Just require: it produced a valid, formatted local instant — no NaN.
  assert.ok(!label.includes("NaN"), label);
});

test("upcoming state", () => {
  const cutoff = new Date("2026-09-30T00:00:00Z");
  const now = new Date("2026-09-25T00:00:00Z");
  assert.equal(getCutoffState(now, cutoff, "open"), "upcoming");
});

test("due-soon within 24h", () => {
  const cutoff = new Date("2026-09-21T19:00:00Z");
  const now = new Date("2026-09-21T00:00:00Z");
  assert.equal(getCutoffState(now, cutoff, "open"), "due_soon");
});

test("overdue open period", () => {
  const cutoff = new Date("2026-09-20T00:00:00Z");
  const now = new Date("2026-09-25T00:00:00Z");
  assert.equal(getCutoffState(now, cutoff, "open"), "overdue");
});

test("overdue rejected period", () => {
  assert.equal(
    getCutoffState(new Date("2026-09-25T00:00:00Z"), new Date("2026-09-20T00:00:00Z"), "rejected"),
    "overdue",
  );
});

test("submitted after cutoff is NOT employee-overdue", () => {
  assert.equal(
    getCutoffState(new Date("2026-09-25T00:00:00Z"), new Date("2026-09-20T00:00:00Z"), "submitted"),
    "not_actionable",
  );
});

test("approved is complete", () => {
  assert.equal(getCutoffState(new Date(), new Date(), "approved"), "not_actionable");
});

test("locked is complete", () => {
  assert.equal(getCutoffState(new Date(), new Date(), "locked"), "not_actionable");
});

test("no cutoff → disabled state", () => {
  assert.equal(getCutoffState(new Date(), null, "open"), "disabled");
});

test("policy validator — offset > 14 rejected", () => {
  assert.equal(isCutoffPolicyReady({ enabled: true, offsetDays: 15, timeLocal: "12:00" }), false);
  assert.equal(isCutoffPolicyReady({ enabled: true, offsetDays: 0, timeLocal: "24:00" }), false);
  assert.equal(isCutoffPolicyReady({ enabled: true, offsetDays: 3, timeLocal: "09:30" }), true);
});
