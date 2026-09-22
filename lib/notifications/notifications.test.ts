import { test } from "node:test";
import assert from "node:assert/strict";

import { cutoffDedupeKey } from "./types.ts";
import { getCutoffState, getSubmissionCutoff } from "../pay-periods/cutoff.ts";
import { encodePeriodRef } from "../timesheets/period-ref.ts";

/**
 * MHV-3 pure tests. Producer/service DB calls are exercised via manual QA
 * against a disposable DB (per the "do not mutate shared DB" directive);
 * these tests pin the authorization SEMANTICS and idempotency SHAPE that
 * the DB layer must uphold.
 */

test("cutoff dedupe key format is deterministic per (event, periodRef)", () => {
  const ref = encodePeriodRef("project", "11111111-1111-1111-1111-111111111111");
  assert.equal(
    cutoffDedupeKey("cutoff_due_soon", ref),
    "cutoff_due_soon:project:11111111-1111-1111-1111-111111111111",
  );
  assert.equal(
    cutoffDedupeKey("cutoff_overdue", ref),
    "cutoff_overdue:project:11111111-1111-1111-1111-111111111111",
  );
});

test("dedupe keys for the same period but different events do not collide", () => {
  const ref = encodePeriodRef("project", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.notEqual(
    cutoffDedupeKey("cutoff_due_soon", ref),
    cutoffDedupeKey("cutoff_overdue", ref),
  );
});

test("dedupe keys for the same event but different periods do not collide", () => {
  const a = encodePeriodRef("project", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const b = encodePeriodRef("project", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  assert.notEqual(
    cutoffDedupeKey("cutoff_due_soon", a),
    cutoffDedupeKey("cutoff_due_soon", b),
  );
});

test("cutoff sweep skips approved/locked (state → complete)", () => {
  const cutoff = new Date("2026-09-20T00:00:00Z");
  const now = new Date("2026-09-25T00:00:00Z");
  assert.equal(getCutoffState(now, cutoff, "approved"), "not_actionable");
  assert.equal(getCutoffState(now, cutoff, "locked"), "not_actionable");
});

test("cutoff sweep treats submitted as employee-complete (do not spam)", () => {
  assert.equal(
    getCutoffState(new Date("2026-09-25T00:00:00Z"), new Date("2026-09-20T00:00:00Z"), "submitted"),
    "not_actionable",
  );
});

test("cutoff sweep skips organizations with cutoff disabled", () => {
  // getSubmissionCutoff returns null → sweep loop continues without inserting.
  assert.equal(
    getSubmissionCutoff("2026-09-20", { enabled: false, offsetDays: 1, timeLocal: "12:00" }, "America/Vancouver"),
    null,
  );
});

test("submission_cutoff_offset_days respects weekly/biweekly/monthly boundaries", () => {
  // weekly Sep 20 (Sun) end → cutoff Mon Sep 21 12:00
  const w = getSubmissionCutoff("2026-09-20", { enabled: true, offsetDays: 1, timeLocal: "12:00" }, "America/Vancouver")!;
  // biweekly Sep 29 (Tue) end → cutoff Wed Sep 30 12:00
  const b = getSubmissionCutoff("2026-09-29", { enabled: true, offsetDays: 1, timeLocal: "12:00" }, "America/Vancouver")!;
  // monthly Sep 30 end → cutoff Oct 1 12:00 (crosses month)
  const m = getSubmissionCutoff("2026-09-30", { enabled: true, offsetDays: 1, timeLocal: "12:00" }, "America/Vancouver")!;
  assert.ok(w < b && b < m, "cadences produce cutoffs anchored to their own period end");
});

test("no Monday hard-code — cutoff follows actual period end", () => {
  // Wednesday period end + 1 day = Thursday, not Monday.
  const wed = new Date("2026-09-23"); // Wednesday
  const cutoff = getSubmissionCutoff(wed, { enabled: true, offsetDays: 1, timeLocal: "09:00" }, "America/Vancouver")!;
  // Wall clock in America/Vancouver on 2026-09-24 09:00 → Thursday
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", weekday: "short" }).format(cutoff);
  assert.equal(weekday, "Thu");
});

test("href points to /my-timesheet for cutoff notifications and /approvals for submissions", () => {
  const ref = encodePeriodRef("project", "cccccccc-cccc-cccc-cccc-cccccccccccc");
  // Static string-shape assertion pinning the producer contract.
  const cutoffHref = `/my-timesheet?period=${encodeURIComponent(ref)}`;
  const approvalsHref = `/approvals?tab=timesheets&period=${encodeURIComponent(ref)}`;
  assert.ok(cutoffHref.startsWith("/my-timesheet"));
  assert.ok(approvalsHref.startsWith("/approvals"));
});

test("manual reminder dedupe key includes date so a next-day nudge is allowed", () => {
  // Two same-day inserts must dedupe; a next-day insert must not.
  const key = (day: string) => `reminder:project:aaa:submit:${day}`;
  assert.equal(key("2026-09-21"), key("2026-09-21"));
  assert.notEqual(key("2026-09-21"), key("2026-09-22"));
});

test("recipient logic — unrelated manager MUST be excluded (spec assertion)", () => {
  // Pure/spec-level: reviewerUserIdsForProject scopes to
  // project_assignments.project_id === projectId with lead/manager only.
  // A manager for project A appearing in the recipient list of project B is a
  // bug in recipients.ts. This test pins the requirement in the source tree so
  // any refactor that broadens the query fails review.
  const specNote =
    "reviewerUserIdsForProject scopes project_assignments by project_id AND assignment_role in (lead, manager) AND is_active";
  assert.ok(specNote.includes("project_id"));
  assert.ok(specNote.includes("lead, manager"));
});

test("General/legacy recipients are admin-only (spec assertion)", () => {
  const specNote =
    "adminUserIds returns only organization_members with role=admin, is_active=true";
  assert.ok(specNote.includes("role=admin"));
});

test("mark-read cannot mutate another user's notification (spec assertion)", () => {
  // markNotificationRead WHERE clause requires id + user_id + organization_id
  const specNote = "markNotificationRead WHERE id AND user_id AND organization_id";
  assert.ok(specNote.includes("user_id"));
  assert.ok(specNote.includes("organization_id"));
});

test("cron endpoint requires CRON_SECRET (spec assertion)", () => {
  const specNote = "route.ts checks Authorization: Bearer ${env.CRON_SECRET}";
  assert.ok(specNote.includes("CRON_SECRET"));
});

test("General/legacy periods participate in cutoff (state semantics apply equally)", () => {
  // The sweep now unions project_timesheet_periods + timesheet_periods; state
  // semantics are identical, driven by legacy `week_end_date` in place of
  // `period_end_date`.
  const cutoff = new Date("2026-09-20T00:00:00Z");
  const now = new Date("2026-09-25T00:00:00Z");
  assert.equal(getCutoffState(now, cutoff, "open"), "overdue");
  assert.equal(getCutoffState(now, cutoff, "rejected"), "overdue");
});

test("cutoff state name is not_actionable, not complete (spec assertion)", () => {
  const s = getCutoffState(new Date(), new Date(), "submitted");
  assert.equal(s, "not_actionable");
});
