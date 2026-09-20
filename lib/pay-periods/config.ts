/**
 * DB/zod bridge for pay-period configuration. The pure precedence resolver and
 * config types live in `calc.ts` (importing nothing, so they stay unit-testable);
 * this module re-exports them and adds the cadence-aware settings input schema +
 * column mapping used by server actions.
 *
 * Precedence (see `resolveEffectivePayPeriodConfig` in calc.ts):
 *   1. PROJECT override   — the project has an explicit `payroll_period_override`
 *   2. ORGANIZATION       — the org has an explicit `payroll_period`
 *   3. LEGACY fallback    — neither is set → WEEKLY starting Monday
 *
 * Legacy fallback rationale: `lib/timesheets/week.ts` hardcodes `WEEK_STARTS_ON =
 * 1` (Monday) and `getWeekRange` ignores `organizations.week_start`, so every
 * currently-visible week (timesheets AND week-first Reports) is Monday–Sunday
 * regardless of the stored `week_start`. Falling back to Monday preserves the
 * exact current behavior; using `week_start` would change what a Sunday-configured
 * org sees. The fallback is deterministic and needs no per-tenant configuration.
 */
import { z } from "zod";

import {
  DEFAULT_MONTHLY_START_DAY,
  DEFAULT_SPLIT_DAY,
  FALLBACK_START_WEEKDAY,
  MAX_MONTHLY_START_DAY,
  MAX_SPLIT_DAY,
  MIN_MONTHLY_START_DAY,
  MIN_SPLIT_DAY,
  PAY_PERIOD_CADENCES,
  type Cadence,
  type PayPeriodConfig,
} from "./calc";

// Re-export the pure resolver surface so existing importers keep working.
export {
  FALLBACK_START_WEEKDAY,
  buildConfig,
  hasProjectPayrollOverride,
  isUsingPayrollFallback,
  resolveEffectivePayPeriodConfig,
  resolveOrgPayPeriodConfig,
  resolvePayPeriodConfig,
} from "./calc";
export type {
  EffectivePayPeriodConfig,
  OrgPayrollRow,
  PayPeriodConfigSource,
  ProjectPayrollRow,
} from "./calc";

// ------------------------------------------------------- settings input schema

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

/**
 * Cadence-aware payroll settings payload. Only the fields relevant to the chosen
 * cadence are required; irrelevant stale fields never cause validation errors.
 * Cross-field rules (e.g. biweekly anchor must fall on the start weekday) are
 * enforced by `validatePayPeriodConfig` in `calc.ts` after mapping.
 */
export const payPeriodSettingsSchema = z
  .object({
    cadence: z.enum(PAY_PERIOD_CADENCES),
    startWeekday: z.coerce.number().int().min(0).max(6).optional(),
    anchor: dateStr.optional(),
    splitDay: z.coerce.number().int().min(MIN_SPLIT_DAY).max(MAX_SPLIT_DAY).optional(),
    monthlyStartDay: z.coerce.number().int().min(MIN_MONTHLY_START_DAY).max(MAX_MONTHLY_START_DAY).optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.cadence === "weekly" || val.cadence === "biweekly") && val.startWeekday === undefined) {
      ctx.addIssue({ code: "custom", message: "Choose a start day.", path: ["startWeekday"] });
    }
    if (val.cadence === "biweekly" && !val.anchor) {
      ctx.addIssue({ code: "custom", message: "Choose an anchor date.", path: ["anchor"] });
    }
    if (val.cadence === "semimonthly" && val.splitDay === undefined) {
      ctx.addIssue({ code: "custom", message: "Choose a split day.", path: ["splitDay"] });
    }
    if (val.cadence === "monthly" && val.monthlyStartDay === undefined) {
      ctx.addIssue({ code: "custom", message: "Choose a monthly start day.", path: ["monthlyStartDay"] });
    }
  });

export type PayPeriodSettingsInput = z.infer<typeof payPeriodSettingsSchema>;

/** Map validated settings input to a `PayPeriodConfig` for calc/validation. */
export function inputToConfig(input: PayPeriodSettingsInput): PayPeriodConfig {
  switch (input.cadence) {
    case "weekly":
      return { cadence: "weekly", startWeekday: input.startWeekday ?? FALLBACK_START_WEEKDAY };
    case "biweekly":
      return {
        cadence: "biweekly",
        startWeekday: input.startWeekday ?? FALLBACK_START_WEEKDAY,
        anchor: input.anchor ?? "",
      };
    case "semimonthly":
      return { cadence: "semimonthly", splitDay: input.splitDay ?? DEFAULT_SPLIT_DAY };
    case "monthly":
      return { cadence: "monthly", startDay: input.monthlyStartDay ?? DEFAULT_MONTHLY_START_DAY };
  }
}

/** The persisted payroll column values for a validated input (unused cadence fields nulled). */
export type PayrollColumnValues = {
  payrollPeriod: Cadence;
  payrollStartWeekday: number | null;
  payrollAnchorDate: string | null;
  payrollSemimonthlyDay: number | null;
  payrollMonthlyStartDay: number | null;
};

export function inputToColumns(input: PayPeriodSettingsInput): PayrollColumnValues {
  const weekdayBased = input.cadence === "weekly" || input.cadence === "biweekly";
  return {
    payrollPeriod: input.cadence,
    payrollStartWeekday: weekdayBased ? (input.startWeekday ?? FALLBACK_START_WEEKDAY) : null,
    payrollAnchorDate: input.cadence === "biweekly" ? (input.anchor ?? null) : null,
    payrollSemimonthlyDay: input.cadence === "semimonthly" ? (input.splitDay ?? DEFAULT_SPLIT_DAY) : null,
    payrollMonthlyStartDay:
      input.cadence === "monthly" ? (input.monthlyStartDay ?? DEFAULT_MONTHLY_START_DAY) : null,
  };
}
