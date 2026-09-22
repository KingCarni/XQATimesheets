import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aggregateMonthlyReport,
  buildEmployeeDetail,
  buildMonthlyEntryWhere,
  buildWeeklyBreakdown,
  currentMonthYm,
  isCurrentMonth,
  monthlyExportFilename,
  normalizeMonthYm,
  resolveMonth,
  shiftMonth,
  type MonthlyEntryRow,
  type MonthlyScope,
} from "./monthly-shape.ts";

// ---- month math -------------------------------------------------------------

test("calendar month start/end resolved correctly", () => {
  const m = resolveMonth("2026-09");
  assert.equal(m.start, "2026-09-01");
  assert.equal(m.end, "2026-09-30");
  assert.equal(m.label, "September 2026");
});

test("leap-year February correct", () => {
  const leap = resolveMonth("2024-02");
  const non = resolveMonth("2026-02");
  assert.equal(leap.end, "2024-02-29");
  assert.equal(non.end, "2026-02-28");
});

test("year boundary navigation Dec → Jan", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
});

test("31-day and 30-day months", () => {
  assert.equal(resolveMonth("2026-01").end, "2026-01-31");
  assert.equal(resolveMonth("2026-04").end, "2026-04-30");
});

test("normalize month accepts valid and falls back", () => {
  assert.equal(normalizeMonthYm("2026-09"), "2026-09");
  assert.equal(normalizeMonthYm("bogus"), currentMonthYm());
  assert.equal(normalizeMonthYm(""), currentMonthYm());
  assert.equal(normalizeMonthYm(null), currentMonthYm());
  assert.equal(normalizeMonthYm("2026-13"), currentMonthYm());
});

test("isCurrentMonth reflects real current UTC month", () => {
  assert.equal(isCurrentMonth(currentMonthYm()), true);
  assert.equal(isCurrentMonth("1999-01"), false);
});

// ---- pure aggregation -------------------------------------------------------

function entry(o: Partial<MonthlyEntryRow>): MonthlyEntryRow {
  return {
    entryId: o.entryId ?? "e-" + Math.random(),
    employeeProfileId: o.employeeProfileId ?? "p1",
    employeeName: o.employeeName ?? "Alice",
    employeeEmail: o.employeeEmail ?? "alice@x.test",
    date: o.date ?? "2026-09-15",
    hours: o.hours ?? 1,
    projectId: o.projectId === undefined ? "proj-a" : o.projectId,
    projectName: o.projectName ?? "Project A",
    activity: o.activity ?? "Development",
    platform: o.platform === undefined ? "Web" : o.platform,
    description: o.description ?? "",
  };
}

test("employee total sums only supplied entries", () => {
  const rows = [
    entry({ employeeProfileId: "p1", hours: 4, date: "2026-09-01" }),
    entry({ employeeProfileId: "p1", hours: 3, date: "2026-09-02" }),
    entry({ employeeProfileId: "p2", hours: 5, date: "2026-09-02" }),
  ];
  const { summary, employees } = aggregateMonthlyReport(rows);
  assert.equal(summary.totalHours, 12);
  assert.equal(summary.employeeCount, 2);
  assert.equal(summary.entryCount, 3);
  const p1 = employees.find((e) => e.employeeProfileId === "p1")!;
  assert.equal(p1.totalHours, 7);
  assert.equal(p1.entryCount, 2);
});

test("employee multiple projects aggregate correctly", () => {
  const rows = [
    entry({ projectId: "a", projectName: "A", hours: 2 }),
    entry({ projectId: "b", projectName: "B", hours: 3 }),
    entry({ projectId: "b", projectName: "B", hours: 1 }),
  ];
  const { employees } = aggregateMonthlyReport(rows);
  assert.equal(employees[0].projectCount, 2);
  assert.equal(employees[0].totalHours, 6);
});

test("distinct project count includes General exactly once", () => {
  const rows = [
    entry({ projectId: null, projectName: "General (no project)" }),
    entry({ projectId: null, projectName: "General (no project)" }),
    entry({ projectId: "a", projectName: "A" }),
  ];
  const { summary } = aggregateMonthlyReport(rows);
  assert.equal(summary.projectCount, 2); // General + A
});

test("active-day count uses distinct entry dates", () => {
  const rows = [
    entry({ date: "2026-09-01" }),
    entry({ date: "2026-09-01" }),
    entry({ date: "2026-09-02" }),
    entry({ date: "2026-09-15" }),
  ];
  const { employees } = aggregateMonthlyReport(rows);
  assert.equal(employees[0].activeDays, 3);
});

test("empty entries produce valid empty summary", () => {
  const { summary, employees } = aggregateMonthlyReport([]);
  assert.deepEqual(summary, { employeeCount: 0, totalHours: 0, projectCount: 0, entryCount: 0 });
  assert.equal(employees.length, 0);
});

// ---- weekly breakdown (clipping) --------------------------------------------

test("weekly grouping preserves only entries within the month", () => {
  const month = resolveMonth("2026-09");
  const rows = [
    entry({ date: "2026-09-01", hours: 5 }), // Tue, week Aug31–Sep6
    entry({ date: "2026-09-06", hours: 2 }), // Sun, same week
    entry({ date: "2026-09-15", hours: 3 }), // mid month
    entry({ date: "2026-09-30", hours: 4 }), // Wed, week Sep28–Oct4
  ];
  const weeks = buildWeeklyBreakdown(rows, month);
  const firstWeek = weeks[0];
  assert.equal(firstWeek.weekStart, "2026-08-31");
  assert.equal(firstWeek.clippedStart, "2026-09-01");
  assert.equal(firstWeek.hours, 7);
  const lastWeek = weeks[weeks.length - 1];
  assert.equal(lastWeek.weekStart, "2026-09-28");
  assert.equal(lastWeek.clippedEnd, "2026-09-30");
  assert.equal(lastWeek.hours, 4);
});

test("partial first and last weeks report clipped ranges", () => {
  const month = resolveMonth("2026-02"); // Feb 2026 starts Sun Feb 1
  const rows = [entry({ date: "2026-02-01", hours: 1 })];
  const weeks = buildWeeklyBreakdown(rows, month);
  assert.equal(weeks[0].weekStart, "2026-01-26");
  assert.equal(weeks[0].clippedStart, "2026-02-01");
  assert.equal(weeks[0].clippedEnd, "2026-02-01");
});

// ---- employee detail --------------------------------------------------------

test("buildEmployeeDetail aggregates projects/activities/platforms", () => {
  const rows = [
    entry({ employeeProfileId: "p1", projectId: "a", projectName: "A", activity: "Dev", platform: "Web", hours: 4 }),
    entry({ employeeProfileId: "p1", projectId: "b", projectName: "B", activity: "QA", platform: null, hours: 2 }),
    entry({ employeeProfileId: "p2", hours: 9 }),
  ];
  const detail = buildEmployeeDetail("p1", rows, resolveMonth("2026-09"))!;
  assert.equal(detail.totalHours, 6);
  assert.equal(detail.entryCount, 2);
  assert.equal(detail.projects.length, 2);
  assert.equal(detail.projects[0].hours, 4);
  assert.equal(detail.platforms.find((p) => p.key === "__none__")!.label, "None");
});

test("buildEmployeeDetail preserves description", () => {
  const rows = [entry({ employeeProfileId: "p1", description: "Fixed the thing" })];
  const detail = buildEmployeeDetail("p1", rows, resolveMonth("2026-09"))!;
  assert.equal(detail.entries[0].description, "Fixed the thing");
});

test("buildEmployeeDetail null for absent profile", () => {
  assert.equal(buildEmployeeDetail("nope", [], resolveMonth("2026-09")), null);
});

// ---- scope / where ----------------------------------------------------------

const adminScope: MonthlyScope = { kind: "admin", organizationId: "org1" };
const managerScope: MonthlyScope = { kind: "manager", organizationId: "org1", managedProjectIds: ["proj-a", "proj-b"] };
const managerNoScope: MonthlyScope = { kind: "manager", organizationId: "org1", managedProjectIds: [] };
const month = resolveMonth("2026-09");

test("admin scope: no project filter widens to all", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month });
  assert.equal(w.organization_id, "org1");
  assert.equal("project_id" in w, false);
});

test("admin scope: project=general → project_id null", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month, project: "general" });
  assert.equal(w.project_id, null);
});

test("admin scope: specific project filter narrows to that project", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month, project: "proj-x" });
  assert.equal(w.project_id, "proj-x");
});

test("manager scope: default limited to managed projects (never General)", () => {
  const w = buildMonthlyEntryWhere({ scope: managerScope, month });
  assert.deepEqual(w.project_id, { in: ["proj-a", "proj-b"] });
});

test("manager scope: project=general returns zero rows (never falls back to managed set)", () => {
  const w = buildMonthlyEntryWhere({ scope: managerScope, month, project: "general" });
  assert.equal(w.project_id, "__none__");
});

test("manager scope: unauthorized project id returns zero rows (never falls back to managed set)", () => {
  const w = buildMonthlyEntryWhere({ scope: managerScope, month, project: "proj-hidden" });
  assert.equal(w.project_id, "__none__");
});

test("manager scope: authorized project id narrows correctly", () => {
  const w = buildMonthlyEntryWhere({ scope: managerScope, month, project: "proj-a" });
  assert.equal(w.project_id, "proj-a");
});

test("admin scope: unknown/cross-tenant project id yields zero rows (org+id filter)", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month, project: "cross-tenant-id" });
  assert.equal(w.organization_id, "org1");
  assert.equal(w.project_id, "cross-tenant-id"); // combined with organization_id → 0 rows
});

test("manager with no managed projects sees nothing", () => {
  const w = buildMonthlyEntryWhere({ scope: managerNoScope, month });
  assert.equal(w.project_id, "__none__");
});

test("employee search adds case-insensitive name/email filter", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month, employeeSearch: "alice" });
  const ep = (w.employee_profile ?? {}) as { OR?: unknown[] };
  assert.ok(Array.isArray(ep.OR));
  assert.equal(ep.OR!.length, 2);
});

test("blank employee search does not attach a filter", () => {
  const w = buildMonthlyEntryWhere({ scope: adminScope, month, employeeSearch: "   " });
  assert.equal("employee_profile" in w, false);
});

// ---- export filename --------------------------------------------------------

test("export filename includes org slug and selected month", () => {
  assert.equal(monthlyExportFilename("xqa", month, "xlsx"), "xqa-monthly-timesheets-2026-09.xlsx");
  assert.equal(monthlyExportFilename("xqa", month, "csv"), "xqa-monthly-timesheets-2026-09.csv");
});
