/**
 * Deterministic unit tests for the pure pay-period core. Run with Node's
 * built-in runner (Node 24 executes TypeScript directly, no extra deps):
 *
 *   node --test lib/pay-periods/calc.test.ts
 *   npm run test:pay-periods
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  configToFieldValues,
  effectiveEndWeekday,
  fieldValuesSignature,
  fieldValuesToConfig,
  getCurrentPayPeriod,
  getNextPayPeriod,
  getPayPeriodForDate,
  getPreviousPayPeriod,
  listPayPeriods,
  resolveEffectivePayPeriodConfig,
  resolveOrgPayPeriodConfig,
  todayInTimeZone,
  validatePayPeriodConfig,
  type OrgPayrollRow,
  type PayPeriodConfig,
  type PayPeriodFieldValues,
  type ProjectPayrollRow,
} from "./calc.ts";

const range = (p: { start: string; end: string }) => `${p.start}..${p.end}`;

// Row builders for precedence tests.
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

// ------------------------------------------------------------------- WEEKLY

test("weekly Monday→Sunday", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 1 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-16")), "2026-09-14..2026-09-20"); // Wed
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-14")), "2026-09-14..2026-09-20"); // exact first day
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-20")), "2026-09-14..2026-09-20"); // exact last day
});

test("weekly Sunday→Saturday", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 0 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-16")), "2026-09-13..2026-09-19");
  assert.equal(effectiveEndWeekday(0), 6);
});

test("weekly Wednesday→Tuesday", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 3 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-16")), "2026-09-16..2026-09-22"); // Wed itself
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-15")), "2026-09-09..2026-09-15"); // Tue -> prev cycle
  assert.equal(effectiveEndWeekday(3), 2); // Wed -> Tue
});

test("weekly previous/next", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 1 };
  const cur = getPayPeriodForDate(cfg, "2026-09-16");
  assert.equal(range(getPreviousPayPeriod(cfg, cur)), "2026-09-07..2026-09-13");
  assert.equal(range(getNextPayPeriod(cfg, cur)), "2026-09-21..2026-09-27");
});

test("weekly month boundary", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 1 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-08-31")), "2026-08-31..2026-09-06");
});

test("weekly year boundary", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 1 };
  // Mon Dec 28 2026 → Sun Jan 3 2027
  assert.equal(range(getPayPeriodForDate(cfg, "2026-12-31")), "2026-12-28..2027-01-03");
});

// ----------------------------------------------------------------- BIWEEKLY

test("biweekly Sunday anchor produces two-week cycles", () => {
  const cfg: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-06")), "2026-09-06..2026-09-19"); // anchor day
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-19")), "2026-09-06..2026-09-19"); // final day
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-20")), "2026-09-20..2026-10-03"); // next cycle
});

test("biweekly before the anchor resolves backwards", () => {
  const cfg: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-05")), "2026-08-23..2026-09-05");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-08-23")), "2026-08-23..2026-09-05");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-08-22")), "2026-08-09..2026-08-22");
});

test("biweekly previous/next across month and year", () => {
  const cfg: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  const cur = getPayPeriodForDate(cfg, "2026-09-10");
  assert.equal(range(getPreviousPayPeriod(cfg, cur)), "2026-08-23..2026-09-05");
  assert.equal(range(getNextPayPeriod(cfg, cur)), "2026-09-20..2026-10-03");
  // Year boundary: a cycle straddling Dec/Jan
  const yearCfg: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  assert.equal(range(getPayPeriodForDate(yearCfg, "2026-12-30")), "2026-12-27..2027-01-09");
});

test("biweekly Monday and Wednesday anchors", () => {
  const mon: PayPeriodConfig = { cadence: "biweekly", startWeekday: 1, anchor: "2026-09-07" };
  assert.equal(range(getPayPeriodForDate(mon, "2026-09-07")), "2026-09-07..2026-09-20");
  const wed: PayPeriodConfig = { cadence: "biweekly", startWeekday: 3, anchor: "2026-09-02" };
  assert.equal(range(getPayPeriodForDate(wed, "2026-09-02")), "2026-09-02..2026-09-15");
});

test("biweekly rejects anchor/start-weekday mismatch", () => {
  const bad: PayPeriodConfig = { cadence: "biweekly", startWeekday: 1, anchor: "2026-09-02" }; // Wed, not Mon
  const res = validatePayPeriodConfig(bad);
  assert.equal(res.ok, false);
  assert.throws(() => getPayPeriodForDate(bad, "2026-09-10"));
  const good: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  assert.equal(validatePayPeriodConfig(good).ok, true);
});

// --------------------------------------------------------------- SEMIMONTHLY

test("semimonthly first and second halves (split 15)", () => {
  const cfg: PayPeriodConfig = { cadence: "semimonthly", splitDay: 15 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-01")), "2026-09-01..2026-09-15");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-15")), "2026-09-01..2026-09-15");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-16")), "2026-09-16..2026-09-30");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-30")), "2026-09-16..2026-09-30");
});

test("semimonthly month lengths: Feb, leap Feb, 30- and 31-day", () => {
  const cfg: PayPeriodConfig = { cadence: "semimonthly", splitDay: 15 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-02-20")), "2026-02-16..2026-02-28"); // 28-day Feb
  assert.equal(range(getPayPeriodForDate(cfg, "2024-02-20")), "2024-02-16..2024-02-29"); // leap Feb
  assert.equal(range(getPayPeriodForDate(cfg, "2026-04-20")), "2026-04-16..2026-04-30"); // 30-day
  assert.equal(range(getPayPeriodForDate(cfg, "2026-07-20")), "2026-07-16..2026-07-31"); // 31-day
});

test("semimonthly December→January navigation", () => {
  const cfg: PayPeriodConfig = { cadence: "semimonthly", splitDay: 15 };
  const dec2 = getPayPeriodForDate(cfg, "2026-12-20"); // Dec 16–31
  assert.equal(range(dec2), "2026-12-16..2026-12-31");
  assert.equal(range(getNextPayPeriod(cfg, dec2)), "2027-01-01..2027-01-15");
  assert.equal(range(getPreviousPayPeriod(cfg, dec2)), "2026-12-01..2026-12-15");
});

test("semimonthly custom split day", () => {
  const cfg: PayPeriodConfig = { cadence: "semimonthly", splitDay: 20 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-20")), "2026-09-01..2026-09-20");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-21")), "2026-09-21..2026-09-30");
});

// ------------------------------------------------------------------ MONTHLY

test("monthly start=1 standard, Feb, leap, and Dec→Jan", () => {
  const cfg: PayPeriodConfig = { cadence: "monthly", startDay: 1 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-16")), "2026-09-01..2026-09-30");
  assert.equal(range(getPayPeriodForDate(cfg, "2026-02-10")), "2026-02-01..2026-02-28");
  assert.equal(range(getPayPeriodForDate(cfg, "2024-02-10")), "2024-02-01..2024-02-29");
  const dec = getPayPeriodForDate(cfg, "2026-12-10");
  assert.equal(range(dec), "2026-12-01..2026-12-31");
  assert.equal(range(getNextPayPeriod(cfg, dec)), "2027-01-01..2027-01-31");
});

test("monthly start=15 before/exact-start/exact-end/next", () => {
  const cfg: PayPeriodConfig = { cadence: "monthly", startDay: 15 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-10")), "2026-08-15..2026-09-14"); // before boundary
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-15")), "2026-09-15..2026-10-14"); // exact start
  assert.equal(range(getPayPeriodForDate(cfg, "2026-10-14")), "2026-09-15..2026-10-14"); // exact end
  assert.equal(range(getPayPeriodForDate(cfg, "2026-10-15")), "2026-10-15..2026-11-14"); // next
});

test("monthly start=26 resolution incl. Dec→Jan and previous/next", () => {
  const cfg: PayPeriodConfig = { cadence: "monthly", startDay: 26 };
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-10")), "2026-08-26..2026-09-25"); // before
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-25")), "2026-08-26..2026-09-25"); // exact end
  assert.equal(range(getPayPeriodForDate(cfg, "2026-09-26")), "2026-09-26..2026-10-25"); // exact start
  assert.equal(range(getPayPeriodForDate(cfg, "2026-12-31")), "2026-12-26..2027-01-25"); // year cross
  assert.equal(range(getPayPeriodForDate(cfg, "2027-01-01")), "2026-12-26..2027-01-25");
  const cur = getPayPeriodForDate(cfg, "2026-09-10");
  assert.equal(range(getPreviousPayPeriod(cfg, cur)), "2026-07-26..2026-08-25");
  assert.equal(range(getNextPayPeriod(cfg, cur)), "2026-09-26..2026-10-25");
});

test("monthly validation rejects 0 and 29, accepts 1 and 28", () => {
  assert.equal(validatePayPeriodConfig({ cadence: "monthly", startDay: 0 }).ok, false);
  assert.equal(validatePayPeriodConfig({ cadence: "monthly", startDay: 29 }).ok, false);
  assert.equal(validatePayPeriodConfig({ cadence: "monthly", startDay: 1 }).ok, true);
  assert.equal(validatePayPeriodConfig({ cadence: "monthly", startDay: 28 }).ok, true);
});

// --------------------------------------------------------------------- MISC

test("listPayPeriods walks forward and backward chronologically", () => {
  const cfg: PayPeriodConfig = { cadence: "weekly", startWeekday: 1 };
  const fwd = listPayPeriods(cfg, "2026-09-16", 3).map(range);
  assert.deepEqual(fwd, [
    "2026-09-14..2026-09-20",
    "2026-09-21..2026-09-27",
    "2026-09-28..2026-10-04",
  ]);
  const back = listPayPeriods(cfg, "2026-09-16", -3).map(range);
  assert.deepEqual(back, [
    "2026-08-31..2026-09-06",
    "2026-09-07..2026-09-13",
    "2026-09-14..2026-09-20",
  ]);
});

test("getCurrentPayPeriod matches getPayPeriodForDate for today", () => {
  const cfg: PayPeriodConfig = { cadence: "monthly", startDay: 1 };
  assert.deepEqual(getCurrentPayPeriod(cfg, "2026-09-16"), getPayPeriodForDate(cfg, "2026-09-16"));
});

// ------------------------------------------------------------------ TIMEZONE

test("todayInTimeZone does not shift the local calendar date across UTC boundary", () => {
  // 2026-09-16 06:30 UTC. In Vancouver (UTC-7 in Sep) it is still 2026-09-15 23:30.
  const instant = new Date("2026-09-16T06:30:00.000Z");
  assert.equal(todayInTimeZone("America/Vancouver", instant), "2026-09-15");
  assert.equal(todayInTimeZone("UTC", instant), "2026-09-16");
  // Sydney (UTC+10) is already the next day.
  assert.equal(todayInTimeZone("Australia/Sydney", instant), "2026-09-16");
});

test("todayInTimeZone is stable across a DST transition", () => {
  // US DST ends 2026-11-01. A date-only query must still yield the wall-clock date.
  const before = new Date("2026-11-01T05:30:00.000Z"); // 01:30 EDT
  const after = new Date("2026-11-01T07:30:00.000Z"); // 02:30 EST
  assert.equal(todayInTimeZone("America/New_York", before), "2026-11-01");
  assert.equal(todayInTimeZone("America/New_York", after), "2026-11-01");
});

// --------------------------------------------------- INTEGRATION (date-level)

test("date-level boundary cuts through an overlapping weekly timesheet", () => {
  // Payroll: biweekly Sun Sep 6 → Sat Sep 19. An employee's Mon–Sun weeks are
  // Sep 7–13 and Sep 14–20. Only dates within [Sep 6, Sep 19] belong to the
  // period — Sep 20 (still in the employee's week) must fall OUTSIDE it.
  const cfg: PayPeriodConfig = { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" };
  const period = getPayPeriodForDate(cfg, "2026-09-10");
  assert.equal(range(period), "2026-09-06..2026-09-19");

  const inPeriod = (d: string) => d >= period.start && d <= period.end;
  // Every day of the two overlapping weeks except the trailing Sep 20:
  for (let d = 7; d <= 19; d++) assert.equal(inPeriod(`2026-09-${String(d).padStart(2, "0")}`), true);
  assert.equal(inPeriod("2026-09-20"), false);
  // ...and Sep 20 belongs to the NEXT period.
  assert.equal(range(getNextPayPeriod(cfg, period)), "2026-09-20..2026-10-03");
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29"); // leap
});

// --------------------------------------------------- CONFIG PRECEDENCE

test("legacy fallback: no org config and no project override → weekly Monday", () => {
  const eff = resolveEffectivePayPeriodConfig(org(), proj());
  assert.equal(eff.source, "legacy");
  assert.deepEqual(eff.config, { cadence: "weekly", startWeekday: 1 });
  // Monday–Sunday, preserving current visible behavior.
  assert.equal(range(getPayPeriodForDate(eff.config, "2026-09-16")), "2026-09-14..2026-09-20");
});

test("project with no override + org explicit → org config", () => {
  const o = org({ payrollPeriod: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" });
  const eff = resolveEffectivePayPeriodConfig(o, proj());
  assert.equal(eff.source, "organization");
  assert.deepEqual(eff.config, { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" });
});

test("project custom + org explicit → project config wins", () => {
  const o = org({ payrollPeriod: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" });
  const p = proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 });
  const eff = resolveEffectivePayPeriodConfig(o, p);
  assert.equal(eff.source, "project");
  assert.deepEqual(eff.config, { cadence: "weekly", startWeekday: 3 });
});

test("inheritance is dynamic: org change flows to inheriting project, not to custom project", () => {
  const p = proj(); // inherits
  const before = resolveEffectivePayPeriodConfig(org({ payrollPeriod: "weekly", payrollStartWeekday: 1 }), p);
  assert.deepEqual(before.config, { cadence: "weekly", startWeekday: 1 });
  // Org switches to biweekly Sunday anchor → inheriting project immediately uses it.
  const after = resolveEffectivePayPeriodConfig(
    org({ payrollPeriod: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" }),
    p,
  );
  assert.equal(after.source, "organization");
  assert.deepEqual(after.config, { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" });
  // A custom project is unaffected by org changes.
  const custom = proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 });
  assert.deepEqual(
    resolveEffectivePayPeriodConfig(org({ payrollPeriod: "monthly", payrollMonthlyStartDay: 26 }), custom).config,
    { cadence: "weekly", startWeekday: 3 },
  );
});

test("disabling a project override falls back to the organization config", () => {
  const o = org({ payrollPeriod: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" });
  // Cleared override (all null) = inherit.
  const eff = resolveEffectivePayPeriodConfig(o, proj());
  assert.equal(eff.source, "organization");
  assert.deepEqual(eff.config, { cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" });
});

test("resolveOrgPayPeriodConfig applies monthly + semimonthly defaults", () => {
  assert.deepEqual(resolveOrgPayPeriodConfig(org({ payrollPeriod: "monthly" })).config, {
    cadence: "monthly",
    startDay: 1,
  });
  assert.deepEqual(resolveOrgPayPeriodConfig(org({ payrollPeriod: "semimonthly" })).config, {
    cadence: "semimonthly",
    splitDay: 15,
  });
});

// --------------------------------------------- DIFFERENT PROJECT CALENDARS

test("same date resolves to different ranges per project calendar", () => {
  const o = org({ payrollPeriod: "weekly", payrollStartWeekday: 1 }); // org Monday
  const projectA = proj(); // inherits → weekly Monday
  const projectB = proj({ payrollPeriodOverride: "weekly", payrollStartWeekday: 3 }); // weekly Wednesday

  const date = "2026-09-16"; // a Wednesday
  const cfgA = resolveEffectivePayPeriodConfig(o, projectA).config;
  const cfgB = resolveEffectivePayPeriodConfig(o, projectB).config;

  assert.equal(range(getPayPeriodForDate(cfgA, date)), "2026-09-14..2026-09-20"); // Mon–Sun
  assert.equal(range(getPayPeriodForDate(cfgB, date)), "2026-09-16..2026-09-22"); // Wed–Tue
});

// ------------------------------------------ EDITOR FIELD ⇆ CONFIG (source of truth)

const fields = (over: Partial<PayPeriodFieldValues> = {}): PayPeriodFieldValues => ({
  cadence: "weekly",
  startWeekday: 1,
  anchor: "",
  splitDay: 15,
  monthlyStartDay: 1,
  ...over,
});

test("configToFieldValues seeds cadence-complete defaults from a weekly config", () => {
  const v = configToFieldValues({ cadence: "weekly", startWeekday: 0 });
  assert.equal(v.cadence, "weekly");
  assert.equal(v.startWeekday, 0);
  assert.equal(v.anchor, ""); // no biweekly anchor for weekly
  assert.equal(v.splitDay, 15);
  assert.equal(v.monthlyStartDay, 1);
});

test("configToFieldValues carries biweekly/semimonthly/monthly specifics", () => {
  assert.equal(configToFieldValues({ cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" }).anchor, "2026-09-06");
  assert.equal(configToFieldValues({ cadence: "semimonthly", splitDay: 20 }).splitDay, 20);
  assert.equal(configToFieldValues({ cadence: "monthly", startDay: 26 }).monthlyStartDay, 26);
});

test("fieldValuesToConfig round-trips every cadence through configToFieldValues", () => {
  const configs: PayPeriodConfig[] = [
    { cadence: "weekly", startWeekday: 0 },
    { cadence: "biweekly", startWeekday: 3, anchor: "2026-09-02" },
    { cadence: "semimonthly", splitDay: 20 },
    { cadence: "monthly", startDay: 26 },
  ];
  for (const cfg of configs) {
    assert.deepEqual(fieldValuesToConfig(configToFieldValues(cfg)), cfg);
  }
});

test("weekly Sunday field values → Sunday start, Saturday end, 7-day period", () => {
  const cfg = fieldValuesToConfig(fields({ cadence: "weekly", startWeekday: 0 }));
  assert.deepEqual(cfg, { cadence: "weekly", startWeekday: 0 });
  assert.equal(effectiveEndWeekday(0), 6); // Saturday
  const p = getPayPeriodForDate(cfg, "2026-09-16");
  assert.equal(range(p), "2026-09-13..2026-09-19");
  assert.equal(addDays(p.start, 6), p.end); // exactly 7 days
});

test("weekly Wednesday field values → Wednesday start, Tuesday end, 7-day period", () => {
  const cfg = fieldValuesToConfig(fields({ cadence: "weekly", startWeekday: 3 }));
  assert.deepEqual(cfg, { cadence: "weekly", startWeekday: 3 });
  assert.equal(effectiveEndWeekday(3), 2); // Tuesday
  const p = getPayPeriodForDate(cfg, "2026-09-16");
  assert.equal(addDays(p.start, 6), p.end); // 7 days
});

test("biweekly Sunday field values → 14-day period, anchor required for validity", () => {
  // With an anchor: valid 14-day cycle.
  const withAnchor = fieldValuesToConfig(fields({ cadence: "biweekly", startWeekday: 0, anchor: "2026-09-06" }));
  assert.equal(validatePayPeriodConfig(withAnchor).ok, true);
  const p = getPayPeriodForDate(withAnchor, "2026-09-10");
  assert.equal(range(p), "2026-09-06..2026-09-19");
  assert.equal(addDays(p.start, 13), p.end); // 14 days
  // Without an anchor: invalid (anchor is required for biweekly).
  const noAnchor = fieldValuesToConfig(fields({ cadence: "biweekly", startWeekday: 0, anchor: "" }));
  assert.equal(validatePayPeriodConfig(noAnchor).ok, false);
});

test("cadence switch: leftover biweekly anchor never affects a weekly config/preview", () => {
  // A user who was on biweekly (anchor set) switches to weekly. The stale anchor
  // and stale splitDay/monthlyStartDay must be ignored entirely by the mapping.
  const stale = fields({ cadence: "weekly", startWeekday: 2, anchor: "2026-09-06", splitDay: 20, monthlyStartDay: 26 });
  const cfg = fieldValuesToConfig(stale);
  assert.deepEqual(cfg, { cadence: "weekly", startWeekday: 2 }); // only weekly fields survive
  const p = getPayPeriodForDate(cfg, "2026-09-16");
  assert.equal(addDays(p.start, 6), p.end); // 7-day, not 14
  // The effective end derives from the SAME startWeekday shown in the editor.
  assert.equal(effectiveEndWeekday(cfg.startWeekday), effectiveEndWeekday(stale.startWeekday));
});

test("fieldValuesSignature changes when any field changes (resets editor state)", () => {
  const base = fields({ cadence: "weekly", startWeekday: 1 });
  assert.equal(fieldValuesSignature(base), fieldValuesSignature(fields({ cadence: "weekly", startWeekday: 1 })));
  assert.notEqual(fieldValuesSignature(base), fieldValuesSignature(fields({ cadence: "biweekly", startWeekday: 1 })));
  assert.notEqual(fieldValuesSignature(base), fieldValuesSignature(fields({ cadence: "weekly", startWeekday: 0 })));
});

test("inheriting project seeds editor from org config; custom project seeds from its own", () => {
  const o = org({ payrollPeriod: "biweekly", payrollStartWeekday: 0, payrollAnchorDate: "2026-09-06" });
  // Inheriting: editor defaults come from the org's effective config.
  const inheritSeed = configToFieldValues(resolveOrgPayPeriodConfig(o).config);
  assert.equal(inheritSeed.cadence, "biweekly");
  assert.equal(inheritSeed.anchor, "2026-09-06");
  // Custom: editor defaults come from the project's own override.
  const custom = proj({ payrollPeriodOverride: "monthly", payrollMonthlyStartDay: 26 });
  const customSeed = configToFieldValues(resolveEffectivePayPeriodConfig(o, custom).config);
  assert.equal(customSeed.cadence, "monthly");
  assert.equal(customSeed.monthlyStartDay, 26);
});
