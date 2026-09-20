/**
 * Pure tests for the My Timesheet summary + day-grid helpers.
 *
 *   node --test lib/timesheets/summary.test.ts
 *
 * These pin down the QA regressions AND the day-visualization requirements:
 *   - Bug 1: selected Day must always sit inside the shown period.
 *   - Bug 2: period-scoped total must ONLY count entries inside that period.
 *   - Day grid: rows anchored to the ACTUAL period start (never Monday), no
 *     out-of-period padding, final row may be short for monthly / semi-monthly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chunkPeriodDays,
  dayTotal,
  listPeriodDays,
  normalizeSelectedDay,
  periodTotal,
  visualWeekForDate,
  weekTotalForPeriod,
} from "./summary.ts";

// A biweekly Thu→Wed project used across several cases.
const BW_START = "2026-09-03"; // Thu
const BW_END = "2026-09-16"; // Wed
const BW_ENTRIES = [
  { entry_date: "2026-09-03", hours: 8 },
  { entry_date: "2026-09-16", hours: 8 },
];

test("periodTotal only counts entries inside the selected period (bug 2)", () => {
  assert.equal(periodTotal(BW_ENTRIES, BW_START, BW_END), 16);
  // Empty next period never carries over.
  assert.equal(periodTotal([], "2026-09-17", "2026-09-30"), 0);
  // Entries outside the range are ignored even when handed in.
  assert.equal(
    periodTotal([...BW_ENTRIES, { entry_date: "2026-08-20", hours: 4 }], BW_START, BW_END),
    16,
  );
});

test("dayTotal only counts entries on that exact day", () => {
  assert.equal(dayTotal(BW_ENTRIES, "2026-09-03"), 8);
  assert.equal(dayTotal(BW_ENTRIES, "2026-09-16"), 8);
  assert.equal(dayTotal(BW_ENTRIES, "2026-09-10"), 0);
});

test("listPeriodDays enumerates every day in [start, end] inclusive", () => {
  const days = listPeriodDays(BW_START, BW_END);
  assert.equal(days.length, 14);
  assert.equal(days[0], "2026-09-03");
  assert.equal(days[13], "2026-09-16");
  // Every day is unique and in strict order.
  for (let i = 1; i < days.length; i++) assert.ok(days[i] > days[i - 1]);
});

test("chunkPeriodDays weekly Wed→Tue produces 1 row × 7 days in correct order", () => {
  const rows = chunkPeriodDays("2026-09-16", "2026-09-22", 7);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [
    "2026-09-16", // Wed
    "2026-09-17", // Thu
    "2026-09-18", // Fri
    "2026-09-19", // Sat
    "2026-09-20", // Sun
    "2026-09-21", // Mon
    "2026-09-22", // Tue
  ]);
});

test("chunkPeriodDays weekly Sun→Sat produces the correct order", () => {
  const rows = chunkPeriodDays("2026-09-06", "2026-09-12", 7);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [
    "2026-09-06", // Sun
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12", // Sat
  ]);
});

test("chunkPeriodDays biweekly Thu→Wed produces 14 days across two 7-day rows", () => {
  const rows = chunkPeriodDays(BW_START, BW_END, 7);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 7);
  assert.equal(rows[1].length, 7);
  assert.deepEqual(rows[0], [
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
  ]);
  assert.deepEqual(rows[1], [
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
  ]);
});

test("chunkPeriodDays monthly Sep 26→Oct 25 covers every date once, last row short", () => {
  const rows = chunkPeriodDays("2026-09-26", "2026-10-25", 7);
  const flat = rows.flat();
  assert.equal(flat.length, 30); // Sep 26 through Oct 25 inclusive
  // No date outside the period.
  for (const d of flat) assert.ok(d >= "2026-09-26" && d <= "2026-10-25");
  // No duplicates.
  assert.equal(new Set(flat).size, flat.length);
  // Sequential, period-anchored rows.
  assert.deepEqual(rows[0].slice(0, 2), ["2026-09-26", "2026-09-27"]);
  // Final row is the leftover < 7 days.
  assert.equal(rows.at(-1)!.length, 30 % 7);
  assert.equal(rows.at(-1)!.at(-1), "2026-10-25");
});

test("no day outside the period is rendered — period start/end are respected", () => {
  const rows = chunkPeriodDays("2026-09-01", "2026-09-05", 7);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
  ]);
});

test("visualWeekForDate returns the row (chunk) that contains the selected date", () => {
  // Row 1 of biweekly Thu→Wed.
  assert.deepEqual(visualWeekForDate("2026-09-03", BW_START, BW_END), {
    start: "2026-09-03",
    end: "2026-09-09",
  });
  // Row 2 of biweekly Thu→Wed.
  assert.deepEqual(visualWeekForDate("2026-09-16", BW_START, BW_END), {
    start: "2026-09-10",
    end: "2026-09-16",
  });
});

test("weekTotalForPeriod: first row = 8h, second row = 8h, period = 16h", () => {
  // Selecting Sep 3 → week (row 1) is Sep 3–9 → 8h.
  assert.equal(weekTotalForPeriod(BW_ENTRIES, "2026-09-03", BW_START, BW_END), 8);
  // Selecting Sep 16 → week (row 2) is Sep 10–16 → 8h.
  assert.equal(weekTotalForPeriod(BW_ENTRIES, "2026-09-16", BW_START, BW_END), 8);
  // Neither carries into pay-period total, which is the sum of both rows.
  assert.equal(periodTotal(BW_ENTRIES, BW_START, BW_END), 16);
});

test("selecting a different day updates day/week totals but not the pay-period total", () => {
  // Move selection to Sep 10 (row 2, no entry) → day 0h, week 8h, period 16h.
  assert.equal(dayTotal(BW_ENTRIES, "2026-09-10"), 0);
  assert.equal(weekTotalForPeriod(BW_ENTRIES, "2026-09-10", BW_START, BW_END), 8);
  assert.equal(periodTotal(BW_ENTRIES, BW_START, BW_END), 16);
});

test("normalizeSelectedDay forces the day inside the shown period (bug 1)", () => {
  // Old day from a previous period → replaced with today when today is inside.
  assert.equal(normalizeSelectedDay("2026-08-01", BW_START, BW_END, "2026-09-05"), "2026-09-05");
  // Today outside the period → falls back to period start.
  assert.equal(normalizeSelectedDay("2026-08-01", BW_START, BW_END, "2026-11-01"), BW_START);
  // Candidate already inside is preserved (user-picked day survives).
  assert.equal(normalizeSelectedDay("2026-09-05", BW_START, BW_END, "2026-09-03"), "2026-09-05");
});

test("General weekly period generates exactly 7 cells", () => {
  const rows = chunkPeriodDays("2026-09-14", "2026-09-20", 7); // Mon–Sun
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 7);
});
