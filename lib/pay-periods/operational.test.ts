/**
 * Pure tests for the operational (project-scoped) submission-period mapping.
 * These cover the MHV-8 follow-up requirement that each entry's submission block
 * is derived from its PROJECT'S effective config + its own date — never a single
 * universal Monday week. Run with:
 *
 *   node --test lib/pay-periods/operational.test.ts
 *   npm run test:pay-periods
 *
 * DB-backed cases (submit/approve/reject isolation, cross-tenant, manager scope,
 * re-pointing on edit) require Prisma and are exercised by the step-2 wiring +
 * the disposable-Neon manual QA plan; the rules they depend on are unit-tested
 * here (period identity, immutability decision, editability).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  operationalPeriodMoved,
  resolveEffectivePayPeriodConfig,
  resolveOperationalPeriod,
  type OrgPayrollRow,
  type ProjectPayrollRow,
} from "./calc.ts";
import { isPeriodEditable } from "../../types/domain.ts";

const range = (p: { start: string; end: string }) => `${p.start}..${p.end}`;

const org = (over: Partial<OrgPayrollRow> = {}): OrgPayrollRow => ({
  payrollPeriod: null,
  payrollStartWeekday: null,
  payrollAnchorDate: null,
  payrollSemimonthlyDay: null,
  payrollMonthlyStartDay: null,
  ...over,
});
const proj = (over: Partial<ProjectPayrollRow> = {}): ProjectPayrollRow => ({
  payrollPeriodOverride: null,
  payrollStartWeekday: null,
  payrollAnchorDate: null,
  payrollSemimonthlyDay: null,
  payrollMonthlyStartDay: null,
  ...over,
});

/** Effective config for a project, applying project → org → legacy precedence. */
const effective = (o: OrgPayrollRow, p: ProjectPayrollRow) => resolveEffectivePayPeriodConfig(o, p).config;

// A mid-September 2026 workday used across the multi-project cases.
const DATE = "2026-09-16"; // Wednesday

test("1) employee + weekly Monday project → Mon–Sun unit", () => {
  const cfg = effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 1 }));
  const period = resolveOperationalPeriod(cfg, DATE);
  assert.equal(range(period), "2026-09-14..2026-09-20"); // Mon..Sun
  assert.equal(period.id, period.start);
});

test("2) weekly Wednesday project → Wed–Tue unit", () => {
  const cfg = effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 }));
  const period = resolveOperationalPeriod(cfg, DATE);
  assert.equal(range(period), "2026-09-16..2026-09-22"); // Wed..Tue
});

test("3) biweekly Sunday project → aligned 14-day Sun–Sat unit", () => {
  const cfg = effective(
    org(),
    proj({ payrollPeriodOverride: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" }),
  );
  const period = resolveOperationalPeriod(cfg, DATE);
  // 2026-09-06 is a Sunday; the cycle containing Sep 16 runs Sep 6 → Sep 19 (14 days).
  assert.equal(range(period), "2026-09-06..2026-09-19");
});

test("4) monthly 26→25 project → the 26th-through-25th unit", () => {
  const cfg = effective(org(), proj({ payrollPeriodOverride: "monthly", payrollMonthlyStartDay: 26 }));
  // Sep 16 falls before the 26th, so it belongs to the Aug 26 → Sep 25 period.
  const period = resolveOperationalPeriod(cfg, DATE);
  assert.equal(range(period), "2026-08-26..2026-09-25");
});

test("5) two projects, different cadences, SAME date → two distinct units", () => {
  const weekly = effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 })); // Wed–Tue
  const biweekly = effective(
    org(),
    proj({ payrollPeriodOverride: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" }),
  );
  const a = resolveOperationalPeriod(weekly, DATE);
  const b = resolveOperationalPeriod(biweekly, DATE);
  assert.equal(range(a), "2026-09-16..2026-09-22");
  assert.equal(range(b), "2026-09-06..2026-09-19");
  assert.notEqual(range(a), range(b));
});

test("6) same calendar date maps to different project workflow period ids", () => {
  const weekly = effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 }));
  const biweekly = effective(
    org(),
    proj({ payrollPeriodOverride: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" }),
  );
  assert.notEqual(resolveOperationalPeriod(weekly, DATE).id, resolveOperationalPeriod(biweekly, DATE).id);
});

test("16) config change does NOT move a frozen (approved/locked) period's boundaries", () => {
  // A historical row was persisted under weekly-Wednesday and then approved.
  const persisted = resolveOperationalPeriod(
    effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 })),
    DATE,
  );
  // Admin later switches the project to biweekly-Sunday.
  const nowResolved = resolveOperationalPeriod(
    effective(org(), proj({ payrollPeriodOverride: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" })),
    DATE,
  );
  // The new config WOULD produce a different unit...
  assert.ok(operationalPeriodMoved(persisted.start, nowResolved.start));
  // ...but an approved period is frozen, so the entry must NOT be re-pointed.
  assert.equal(isPeriodEditable("approved"), false);
  assert.equal(isPeriodEditable("locked"), false);
  assert.equal(isPeriodEditable("submitted"), false);
  // The persisted boundaries are plain stored strings — unchanged by re-resolution.
  assert.equal(range(persisted), "2026-09-16..2026-09-22");
});

test("16b) config change DOES re-point an open/rejected period", () => {
  const before = resolveOperationalPeriod(
    effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 })),
    DATE,
  );
  const after = resolveOperationalPeriod(
    effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 1 })),
    DATE,
  );
  assert.ok(operationalPeriodMoved(before.start, after.start));
  assert.equal(isPeriodEditable("open"), true);
  assert.equal(isPeriodEditable("rejected"), true);
});

test("17) legacy project with no config still resolves weekly Monday", () => {
  const cfg = effective(org(), proj()); // no org config, no project override
  assert.deepEqual(cfg, { cadence: "weekly", startWeekday: 1 });
  const period = resolveOperationalPeriod(cfg, DATE);
  assert.equal(range(period), "2026-09-14..2026-09-20"); // Mon..Sun
});

test("18) a period cutting through a Mon–Sun week only owns its in-range dates", () => {
  // Wed–Tue weekly period Sep 16..Sep 22. The prior Mon–Sun week is Sep 14..Sep 20.
  const cfg = effective(org(), proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 }));
  const period = resolveOperationalPeriod(cfg, DATE);
  const inRange = (d: string) => d >= period.start && d <= period.end;
  // Mon Sep 14 and Tue Sep 15 are in the same calendar week but BEFORE this unit.
  assert.equal(inRange("2026-09-14"), false);
  assert.equal(inRange("2026-09-15"), false);
  // The unit's own dates belong to it.
  assert.equal(inRange("2026-09-16"), true);
  assert.equal(inRange("2026-09-22"), true);
  // Wed Sep 23 starts the next unit.
  assert.equal(inRange("2026-09-23"), false);
});
