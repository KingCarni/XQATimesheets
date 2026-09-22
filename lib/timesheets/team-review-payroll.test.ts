/**
 * Pure tests for MHV-10 (Outstanding filter) + MHV-5 (payroll readiness).
 *
 *   node --test lib/timesheets/team-review-payroll.test.ts
 *
 * Reviewer authorization is enforced by the DB layer in `team-review.ts`
 * before rows reach here — these cases pin down the deterministic
 * client-visible behavior of the workspace and payroll report.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildExportFilename,
  buildPayrollExportRows,
  categorizePayrollReadiness,
  derivePayrollActionItem,
  filterReviewRows,
  isOutstandingStatus,
  PAYROLL_READINESS_LABELS,
  summarizePayrollRows,
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

// ---------------------------------------------------------------------------
// MHV-10 — Outstanding = Open + Submitted + Rejected. Never Approved/Locked.
// ---------------------------------------------------------------------------

test("1. outstanding filter includes open + submitted + rejected", () => {
  const rows = [
    row({ ref: "a", status: "open" }),
    row({ ref: "b", status: "submitted" }),
    row({ ref: "c", status: "rejected" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "outstanding" });
  assert.deepEqual(kept.map((r) => r.status).sort(), ["open", "rejected", "submitted"]);
});

test("2. outstanding filter excludes approved", () => {
  const rows = [
    row({ ref: "a", status: "approved" }),
    row({ ref: "b", status: "submitted" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "outstanding" });
  assert.deepEqual(kept.map((r) => r.ref), ["b"]);
});

test("3. outstanding filter excludes locked", () => {
  const rows = [
    row({ ref: "a", status: "locked" }),
    row({ ref: "b", status: "rejected" }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-20", status: "outstanding" });
  assert.deepEqual(kept.map((r) => r.ref), ["b"]);
});

test("isOutstandingStatus enumerates the exact set", () => {
  assert.equal(isOutstandingStatus("open"), true);
  assert.equal(isOutstandingStatus("submitted"), true);
  assert.equal(isOutstandingStatus("rejected"), true);
  assert.equal(isOutstandingStatus("approved"), false);
  assert.equal(isOutstandingStatus("locked"), false);
});

test("8. affected employees remain distinct by project/period (outstanding of two projects)", () => {
  // Same employee, two different projects — the filter must not collapse them.
  const rows = [
    row({
      ref: "project:mario",
      projectId: "p-mario",
      projectName: "Mario",
      status: "submitted",
      periodStart: "2026-09-16",
      periodEnd: "2026-09-29",
    }),
    row({
      ref: "project:zelda",
      projectId: "p-zelda",
      projectName: "Zelda",
      status: "open",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-20",
    }),
  ];
  const kept = filterReviewRows(rows, { referenceDate: "2026-09-18", status: "outstanding" });
  assert.equal(kept.length, 2);
  assert.deepEqual(new Set(kept.map((r) => r.projectName)), new Set(["Mario", "Zelda"]));
});

test("9. detail links use the row's exact period ref for open/rejected/approved", () => {
  const openRow = row({ ref: "project:abc", status: "open" });
  assert.equal(derivePayrollActionItem(openRow).href, "/team/project%3Aabc");
  const rejectedRow = row({ ref: "project:def", status: "rejected" });
  // Rejected → deep-links into Approvals so the reviewer sees the reason inline.
  assert.equal(derivePayrollActionItem(rejectedRow).href, "/approvals?tab=timesheets&period=project%3Adef");
  const approvedRow = row({ ref: "project:ghi", status: "approved" });
  assert.equal(derivePayrollActionItem(approvedRow).href, "/team/project%3Aghi");
});

test("10. submitted rows deep-link into Approvals for reviewer action", () => {
  const submittedRow = row({ ref: "project:xyz", status: "submitted" });
  assert.equal(
    derivePayrollActionItem(submittedRow).href,
    "/approvals?tab=timesheets&period=project%3Axyz",
  );
});

// ---------------------------------------------------------------------------
// MHV-5 — payroll readiness categorization + summary + export shaping.
// ---------------------------------------------------------------------------

test("11. approved → Ready", () => {
  assert.equal(categorizePayrollReadiness("approved"), "ready");
});
test("12. locked → Ready", () => {
  assert.equal(categorizePayrollReadiness("locked"), "ready");
});
test("13. submitted → Awaiting Review", () => {
  assert.equal(categorizePayrollReadiness("submitted"), "awaiting_review");
});
test("14. open → Employee Action", () => {
  assert.equal(categorizePayrollReadiness("open"), "employee_action");
});
test("15. rejected → Employee Action", () => {
  assert.equal(categorizePayrollReadiness("rejected"), "employee_action");
});

test("readiness labels are stable, user-facing strings", () => {
  assert.deepEqual(PAYROLL_READINESS_LABELS, {
    ready: "Ready",
    awaiting_review: "Awaiting review",
    employee_action: "Employee action",
  });
});

test("16. payroll summary counts categories correctly", () => {
  const rows = [
    row({ ref: "a", employeeProfileId: "e1", status: "approved", totalHours: 40 }),
    row({ ref: "b", employeeProfileId: "e1", status: "submitted", totalHours: 16 }),
    row({ ref: "c", employeeProfileId: "e2", status: "open", totalHours: 4 }),
    row({ ref: "d", employeeProfileId: "e2", status: "rejected", totalHours: 8 }),
    row({ ref: "e", employeeProfileId: "e3", status: "locked", totalHours: 32 }),
  ];
  const s = summarizePayrollRows(rows);
  assert.equal(s.readyCount, 2); // approved + locked
  assert.equal(s.awaitingReviewCount, 1);
  assert.equal(s.employeeActionCount, 2); // open + rejected
  assert.equal(s.visibleEmployees, 3);
});

test("17. payroll summary hours = sum of visible authorized rows only", () => {
  const rows = [
    row({ ref: "a", totalHours: 8 }),
    row({ ref: "b", totalHours: 2.5 }),
    row({ ref: "c", totalHours: 0.25 }),
  ];
  const s = summarizePayrollRows(rows);
  assert.equal(s.totalHours, 10.75);
});

test("18. mixed project cadences remain independent in payroll rows", () => {
  const rows = [
    row({ ref: "wk", projectName: "Weekly", cadence: "Weekly", periodStart: "2026-09-14", periodEnd: "2026-09-20" }),
    row({ ref: "bi", projectName: "Biweekly", cadence: "Biweekly", periodStart: "2026-09-16", periodEnd: "2026-09-29" }),
  ];
  const exported = buildPayrollExportRows(rows);
  assert.deepEqual(
    exported.map((r) => [r.project, r.cadence, r.periodStart, r.periodEnd]),
    [
      ["Weekly", "Weekly", "2026-09-14", "2026-09-20"],
      ["Biweekly", "Biweekly", "2026-09-16", "2026-09-29"],
    ],
  );
});

test("19. General labelled distinctly and marked isGeneral", () => {
  const rows = [
    row({
      ref: "legacy:g1",
      projectId: null,
      projectName: "General (no project)",
      cadence: "Weekly",
      isGeneral: true,
      status: "submitted",
    }),
  ];
  const exported = buildPayrollExportRows(rows);
  assert.equal(exported[0].project, "General (no project)");
});

test("20. export rows preserve BOTH readiness and workflow status", () => {
  const rows = [
    row({ ref: "a", status: "approved", submittedAt: "2026-09-30T00:00:00Z" }),
    row({ ref: "b", status: "rejected", rejectionReason: "please add descriptions" }),
  ];
  const [approvedRow, rejectedRow] = buildPayrollExportRows(rows);
  assert.equal(approvedRow.status, "approved");
  assert.equal(approvedRow.readiness, "ready");
  assert.equal(approvedRow.readinessLabel, "Ready");
  assert.equal(approvedRow.submittedAt, "2026-09-30T00:00:00Z");
  assert.equal(rejectedRow.status, "rejected");
  assert.equal(rejectedRow.readiness, "employee_action");
  assert.equal(rejectedRow.rejectionReason, "please add descriptions");
});

test("23. no Late/Overdue category exists before MHV-4", () => {
  // Categorization is total over ReviewStatus; there is no fourth bucket.
  const buckets = new Set(["open", "submitted", "approved", "rejected", "locked"].map((s) =>
    categorizePayrollReadiness(s as ReviewPeriodRow["status"]),
  ));
  assert.deepEqual(new Set([...buckets].sort()), new Set(["awaiting_review", "employee_action", "ready"]));
});

test("24. action-item derivation covers every workflow status", () => {
  const cases: Array<[ReviewPeriodRow["status"], "employee_submit" | "reviewer_approve" | "employee_correct" | "none"]> = [
    ["open", "employee_submit"],
    ["submitted", "reviewer_approve"],
    ["rejected", "employee_correct"],
    ["approved", "none"],
    ["locked", "none"],
  ];
  for (const [status, actionType] of cases) {
    const item = derivePayrollActionItem(row({ ref: "x", status }));
    assert.equal(item.actionType, actionType, `status=${status}`);
  }
});

test("payroll export filename variant + optional project scope", () => {
  assert.equal(
    buildExportFilename({ orgSlug: "acme", referenceDate: "2026-09-20", format: "xlsx", variant: "payroll" }),
    "acme-payroll-2026-09-20.xlsx",
  );
  assert.equal(
    buildExportFilename({
      orgSlug: "acme",
      referenceDate: "2026-09-20",
      format: "csv",
      variant: "payroll",
      projectSlug: "mario",
    }),
    "acme-payroll-mario-2026-09-20.csv",
  );
});

test("filename default variant is hours-review (backward-compatible with MHV-9)", () => {
  assert.equal(
    buildExportFilename({ orgSlug: "acme", referenceDate: "2026-09-20", format: "xlsx" }),
    "acme-hours-review-2026-09-20.xlsx",
  );
});
