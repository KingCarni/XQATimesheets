/**
 * Pure tests for MHV-11 row-completeness rules. These pin down the acceptance
 * criteria: no empty/zero placeholder rows, platform required only when the
 * project requires it, and General/no-project time stays legitimate.
 *
 *   node --test lib/timesheets/entry-validation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { firstIssueMessage, validateEntryCompleteness } from "./entry-validation.ts";

const PROJECT_WITH_PLATFORM = { requiresPlatform: true };
const PROJECT_WITHOUT_PLATFORM = { requiresPlatform: false };

const validProjectEntry = {
  entryDate: "2026-09-20",
  hours: 4,
  activityTypeId: "activity-1",
  projectId: "project-1",
  platformId: "platform-1",
};

test("1. valid project entry passes", () => {
  const r = validateEntryCompleteness(validProjectEntry, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test("2. 0-hour project entry fails on hours", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, hours: 0 }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "hours");
  assert.match(r.issues[0].message, /greater than 0/);
});

test("3. negative-hours entry fails on hours", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, hours: -1 }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "hours");
});

test("empty-hours entry fails with 'Enter hours' (distinct from 0)", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, hours: "" }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "hours");
  assert.match(r.issues[0].message, /Enter hours/);
});

test("hours > 24 fails", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, hours: 25 }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "hours");
});

test("4. missing work type fails", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, activityTypeId: "" }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.field === "activityTypeId"));
});

test("5. project requiring platform + missing platform fails", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, platformId: "" }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "platformId");
  assert.match(r.issues[0].message, /Platform is required/);
});

test("6. project requiring platform + platform present passes", () => {
  const r = validateEntryCompleteness(validProjectEntry, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, true);
});

test("7. project NOT requiring platform + no platform passes", () => {
  const r = validateEntryCompleteness(
    { ...validProjectEntry, platformId: "" },
    PROJECT_WITHOUT_PLATFORM,
  );
  assert.equal(r.ok, true);
});

test("8. General/no-project valid entry passes without project or platform", () => {
  const r = validateEntryCompleteness(
    {
      entryDate: "2026-09-20",
      hours: 2,
      activityTypeId: "activity-1",
      projectId: null,
      platformId: null,
    },
    null,
  );
  assert.equal(r.ok, true);
});

test("9. General/no-project 0h fails", () => {
  const r = validateEntryCompleteness(
    {
      entryDate: "2026-09-20",
      hours: 0,
      activityTypeId: "activity-1",
      projectId: null,
      platformId: null,
    },
    null,
  );
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "hours");
});

test("General entries never require a platform even if a project-requires flag exists", () => {
  // Defensive: a General entry with projectId null must not be tripped by a
  // stale project ref sneaking in — no project, no platform requirement.
  const r = validateEntryCompleteness(
    {
      entryDate: "2026-09-20",
      hours: 2,
      activityTypeId: "activity-1",
      projectId: null,
      platformId: null,
    },
    PROJECT_WITH_PLATFORM,
  );
  assert.equal(r.ok, true);
});

test("missing entry date fails", () => {
  const r = validateEntryCompleteness({ ...validProjectEntry, entryDate: "" }, PROJECT_WITH_PLATFORM);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "entryDate");
});

test("malformed entry date fails", () => {
  const r = validateEntryCompleteness(
    { ...validProjectEntry, entryDate: "2026/09/20" },
    PROJECT_WITH_PLATFORM,
  );
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].field, "entryDate");
});

test("multiple issues accumulate in field order (hours → activity → platform)", () => {
  const r = validateEntryCompleteness(
    {
      entryDate: "2026-09-20",
      hours: 0,
      activityTypeId: "",
      projectId: "project-1",
      platformId: "",
    },
    PROJECT_WITH_PLATFORM,
  );
  assert.equal(r.ok, false);
  const fields = r.issues.map((i) => i.field);
  assert.deepEqual(fields, ["hours", "activityTypeId", "platformId"]);
});

test("15. client error mapping — firstIssueMessage returns field-specific string, or null on OK", () => {
  assert.equal(
    firstIssueMessage(
      validateEntryCompleteness({ ...validProjectEntry, hours: 0 }, PROJECT_WITH_PLATFORM),
    ),
    "Hours must be greater than 0.",
  );
  assert.equal(
    firstIssueMessage(
      validateEntryCompleteness({ ...validProjectEntry, platformId: "" }, PROJECT_WITH_PLATFORM),
    ),
    "Platform is required for this project.",
  );
  assert.equal(
    firstIssueMessage(validateEntryCompleteness(validProjectEntry, PROJECT_WITH_PLATFORM)),
    null,
  );
});
