/**
 * Pure tests for MHV-2 / MHV-9 reviewer shaping + filtering.
 *
 *   node --test lib/timesheets/team-review-shape.test.ts
 *
 * Reviewer authorization (admin vs manager, tenant isolation, General
 * visibility) is enforced by the DB layer in `team-review.ts` — these tests
 * assume authorization has already run and pin down the deterministic
 * client-visible behavior of the workspace.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildExportFilename,
  filterReviewRows,
  summarizeReviewRows,
  type ReviewPeriodRow,
} from "./team-review-shape.ts";

function row(over: Partial<ReviewPeriodRow>): ReviewPeriodRow {
  return {
    ref: "project:p1",
    employeeProfileId: "emp-1",
    employeeName: "Harley Curtis",
    employeeEmail: "harley@example.com",
    projectId: "project-mario",
    projectName: "Mario",
    cadence: "Biweekly",
    periodStart: "2026-09-16",
    periodEnd: "2026-09-29",
    totalHours: 16,
    status: "submitted",
    submittedAt: "2026-09-29T18:00:00Z",
    rejectionReason: null,
    isGeneral: false,
    ...over,
  };
}

test("6. employee with 2 projects produces 2 independent rows (not collapsed)", () => {
  const rows = [
    row({ ref: "project:p1", projectId: "project-mario", projectName: "Mario", totalHours: 16 }),
    row({
      ref: "project:p2",
      projectId: "project-zelda",
      projectName: "Zelda",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
      cadence: "Weekly",
      totalHours: 8,
      status: "open",
    }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-18" });
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((r) => r.projectName).sort(), ["Mario", "Zelda"]);
});

test("7. different project cadences/ranges remain distinct — each row keeps its own period", () => {
  const rows = [
    row({ ref: "project:weekly", projectName: "Weekly", cadence: "Weekly", periodStart: "2026-09-14", periodEnd: "2026-09-20", totalHours: 8, status: "open" }),
    row({ ref: "project:bi", projectName: "Biweekly", cadence: "Biweekly", periodStart: "2026-09-16", periodEnd: "2026-09-29", totalHours: 16 }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-18" });
  assert.equal(kept.length, 2);
  assert.equal(kept.find((r) => r.projectName === "Weekly")?.periodEnd, "2026-09-20");
  assert.equal(kept.find((r) => r.projectName === "Biweekly")?.periodEnd, "2026-09-29");
});

test("reference-date filter drops rows whose period does not contain the ref", () => {
  const rows = [
    row({ ref: "a", periodStart: "2026-09-16", periodEnd: "2026-09-29" }),
    row({ ref: "b", periodStart: "2026-08-01", periodEnd: "2026-08-14" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20" });
  assert.deepEqual(kept.map((r) => r.ref), ["a"]);
});

test("14. project filter — server-scoped rows are further narrowed by projectId", () => {
  const rows = [
    row({ ref: "a", projectId: "p-mario", projectName: "Mario" }),
    row({ ref: "b", projectId: "p-zelda", projectName: "Zelda" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20", projectId: "p-zelda" });
  assert.deepEqual(kept.map((r) => r.ref), ["b"]);
});

test("15. status filter narrows to a specific state; 'all' keeps everything", () => {
  const rows = [
    row({ ref: "a", status: "submitted" }),
    row({ ref: "b", status: "open" }),
    row({ ref: "c", status: "rejected" }),
  ];
  const submitted = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "submitted" });
  assert.deepEqual(submitted.map((r) => r.ref), ["a"]);
  const all = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "all" });
  assert.equal(all.length, 3);
});

test("16. employee search matches full name OR email, case-insensitively", () => {
  const rows = [
    row({ ref: "a", employeeName: "Harley Curtis", employeeEmail: "harley@example.com" }),
    row({ ref: "b", employeeName: "Alex Morgan", employeeEmail: "alex@example.com" }),
  ];
  assert.deepEqual(
    filterReviewRows(rows, { referenceDate: "2026-09-20", employeeSearch: "HARLEY" }).map((r) => r.ref),
    ["a"],
  );
  assert.deepEqual(
    filterReviewRows(rows, { referenceDate: "2026-09-20", employeeSearch: "alex@" }).map((r) => r.ref),
    ["b"],
  );
});

test("sort order surfaces the most actionable rows first (submitted → rejected → open → approved → locked)", () => {
  const rows = [
    row({ ref: "approved", status: "approved" }),
    row({ ref: "locked", status: "locked" }),
    row({ ref: "open", status: "open" }),
    row({ ref: "submitted", status: "submitted" }),
    row({ ref: "rejected", status: "rejected" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "all" });
  assert.deepEqual(kept.map((r) => r.ref), ["submitted", "rejected", "open", "approved", "locked"]);
});

test("summary counts are precise and never include target/expected hours", () => {
  const rows = [
    row({ ref: "a", employeeProfileId: "e1", status: "submitted", totalHours: 16 }),
    row({ ref: "b", employeeProfileId: "e1", status: "open", totalHours: 4 }),
    row({ ref: "c", employeeProfileId: "e2", status: "rejected", totalHours: 5.5 }),
    row({ ref: "d", employeeProfileId: "e2", status: "approved", totalHours: 8 }),
  ];
  const summary = summarizeReviewRows(rows);
  assert.equal(summary.visibleEmployees, 2);
  assert.equal(summary.totalHours, 33.5);
  assert.equal(summary.submittedCount, 1);
  assert.equal(summary.openCount, 1);
  assert.equal(summary.rejectedCount, 1);
});

test("empty result set yields zero-count summary (no NaN)", () => {
  const summary = summarizeReviewRows([]);
  assert.deepEqual(summary, {
    visibleEmployees: 0,
    totalHours: 0,
    submittedCount: 0,
    openCount: 0,
    rejectedCount: 0,
  });
});

test("export filename encodes org slug, reference date, and optional project scope", () => {
  assert.equal(
    buildExportFilename({ orgSlug: "acme", referenceDate: "2026-09-20", format: "xlsx" }),
    "acme-hours-review-2026-09-20.xlsx",
  );
  assert.equal(
    buildExportFilename({
      orgSlug: "acme",
      referenceDate: "2026-09-20",
      projectSlug: "mario",
      format: "csv",
    }),
    "acme-hours-review-mario-2026-09-20.csv",
  );
});
