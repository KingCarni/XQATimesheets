/**
 * Pure tests for the MHV-11 submission-block completeness reducer.
 *
 *   node --test lib/timesheets/period-completeness.test.ts
 *
 * These prove the submission-gate behavior end-to-end WITHOUT the DB layer:
 * the server actions (`submitProjectPeriod`, `submitWeek`) reduce every
 * fetched row through `assessEntryRows`, so every case below is what those
 * actions see in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assessEntryRows,
  summarizeIncomplete,
  type EntryRowForCompleteness,
} from "./entry-validation.ts";

const withPlatform = { requiresPlatform: true } as const;
const withoutPlatform = { requiresPlatform: false } as const;

function projectRow(id: string, over: Partial<EntryRowForCompleteness> = {}): EntryRowForCompleteness {
  return {
    entryId: id,
    entryDate: "2026-09-20",
    hours: 4,
    activityTypeId: "activity-1",
    projectId: "project-1",
    platformId: "platform-1",
    project: withPlatform,
    ...over,
  };
}

function generalRow(id: string, over: Partial<EntryRowForCompleteness> = {}): EntryRowForCompleteness {
  return {
    entryId: id,
    entryDate: "2026-09-20",
    hours: 2,
    activityTypeId: "activity-1",
    projectId: null,
    platformId: null,
    project: null,
    ...over,
  };
}

test("1. valid project-period entries pass completeness validation", () => {
  const result = assessEntryRows([projectRow("e1"), projectRow("e2", { entryDate: "2026-09-21", hours: 8 })]);
  assert.equal(result.ok, true);
  assert.equal(result.entryCount, 2);
  assert.deepEqual(result.incomplete, []);
  assert.equal(result.summary, null);
});

test("2. one invalid project entry blocks period completeness", () => {
  const result = assessEntryRows([
    projectRow("e1"),
    projectRow("e2", { entryDate: "2026-09-21", hours: 0 }),
    projectRow("e3", { entryDate: "2026-09-22", hours: 4 }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.entryCount, 3);
  assert.equal(result.incomplete.length, 1);
  assert.equal(result.incomplete[0].entryId, "e2");
  assert.equal(result.incomplete[0].issue.field, "hours");
});

test("3. failure reports the offending date and specific message in the summary", () => {
  const result = assessEntryRows([
    projectRow("e1", { entryDate: "2026-09-21", hours: 0 }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.summary, "2026-09-21: Hours must be greater than 0.");
});

test("4. General/null-project valid entries pass", () => {
  const result = assessEntryRows([generalRow("g1"), generalRow("g2", { hours: 3.5 })]);
  assert.equal(result.ok, true);
  assert.equal(result.entryCount, 2);
});

test("5. General/null-project incomplete entry fails", () => {
  const result = assessEntryRows([
    generalRow("g1", { hours: 0 }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.incomplete[0].issue.field, "hours");
  assert.match(result.summary ?? "", /Hours must be greater than 0/);
});

test("General row with missing work type fails on activityTypeId", () => {
  const result = assessEntryRows([generalRow("g1", { activityTypeId: null })]);
  assert.equal(result.ok, false);
  assert.equal(result.incomplete[0].issue.field, "activityTypeId");
});

test("6. project requiring platform fails when platform missing", () => {
  const result = assessEntryRows([
    projectRow("e1", { platformId: null }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.incomplete[0].issue.field, "platformId");
  assert.match(result.incomplete[0].issue.message, /Platform is required/);
});

test("7. project NOT requiring platform passes with platform null", () => {
  const result = assessEntryRows([
    projectRow("e1", { platformId: null, project: withoutPlatform }),
  ]);
  assert.equal(result.ok, true);
});

test("8. multiple bad entries produce deterministic, actionable summary output", () => {
  // Three distinct failing entries; ordering follows input order + validator's
  // field-order emission, so the FIRST issue anchors the one-line summary.
  const result = assessEntryRows([
    projectRow("e1", { entryDate: "2026-09-20", hours: 0 }),
    projectRow("e2", { entryDate: "2026-09-21", platformId: null }),
    projectRow("e3", { entryDate: "2026-09-22", activityTypeId: null }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.entryCount, 3);
  assert.equal(result.incomplete.length, 3);
  // Deterministic order: entry order preserved.
  assert.deepEqual(
    result.incomplete.map((i) => ({ id: i.entryId, field: i.issue.field })),
    [
      { id: "e1", field: "hours" },
      { id: "e2", field: "platformId" },
      { id: "e3", field: "activityTypeId" },
    ],
  );
  // Actionable summary anchors on the first failing date + tells the user how
  // many more entries are affected — matching the exact format the server
  // action bubbles up to the UI.
  assert.equal(
    result.summary,
    "2026-09-20: Hours must be greater than 0. (+2 more entries need attention)",
  );
});

test("summary uses singular 'entry' when exactly one other row is affected", () => {
  const result = assessEntryRows([
    projectRow("e1", { entryDate: "2026-09-20", hours: 0 }),
    projectRow("e2", { entryDate: "2026-09-21", platformId: null }),
  ]);
  assert.equal(
    result.summary,
    "2026-09-20: Hours must be greater than 0. (+1 more entry needs attention)",
  );
});

test("summarizeIncomplete on an empty list returns null (submit-ready)", () => {
  assert.equal(summarizeIncomplete([]), null);
});

test("empty period reports ok:true (no entries → nothing to block)", () => {
  // The submit action separately guards against empty periods with its own
  // "no entries to submit" error; this assessor is strictly about existing
  // rows and correctly reports ok when there are none.
  const result = assessEntryRows([]);
  assert.equal(result.ok, true);
  assert.equal(result.entryCount, 0);
  assert.equal(result.summary, null);
});
