import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import {
  configToFieldValues,
  describeConfig,
  getPayPeriodForDate,
  todayInTimeZone,
  type PayPeriodFieldValues,
} from "@/lib/pay-periods/calc";
import {
  resolveEffectivePayPeriodConfig,
  resolveOrgPayPeriodConfig,
  type OrgPayrollRow,
  type ProjectPayrollRow,
} from "@/lib/pay-periods/config";

/** Cadence-field defaults for prefilling the custom form from a resolved config. */
export type PayPeriodFieldDefaults = PayPeriodFieldValues;

export type ProjectPayPeriodView = {
  hasOverride: boolean;
  source: "project" | "organization" | "legacy";
  /** Effective (project-or-inherited) cadence summary + current range. */
  effectiveSummary: string;
  effectiveCurrentLabel: string;
  /** The organization default (shown when inheriting) — summary + current range. */
  orgSummary: string;
  orgCurrentLabel: string;
  /** Form prefill: the project override if set, else the org default as a starting point. */
  formDefaults: PayPeriodFieldDefaults;
};

const PROJECT_PAYROLL_COLUMNS = {
  payroll_period_override: true,
  payroll_start_weekday: true,
  payroll_anchor_date: true,
  payroll_semimonthly_day: true,
  payroll_monthly_start_day: true,
} as const;

/**
 * Build pay-period views for every project in the org with ONE org read + ONE
 * projects read (no N+1). Inheritance is dynamic: inheriting projects reflect
 * the org's current config because nothing is copied onto them.
 */
export async function getProjectPayPeriodViews(
  organizationId: string,
): Promise<Map<string, ProjectPayPeriodView>> {
  const [org, projects] = await Promise.all([
    prisma.organizations.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        timezone: true,
        payroll_period: true,
        payroll_start_weekday: true,
        payroll_anchor_date: true,
        payroll_semimonthly_day: true,
        payroll_monthly_start_day: true,
      },
    }),
    prisma.projects.findMany({
      where: { organization_id: organizationId },
      select: { id: true, ...PROJECT_PAYROLL_COLUMNS },
    }),
  ]);

  const orgRow: OrgPayrollRow = {
    payrollPeriod: org.payroll_period,
    payrollStartWeekday: org.payroll_start_weekday,
    payrollAnchorDate: org.payroll_anchor_date ? dateOnly(org.payroll_anchor_date) : null,
    payrollSemimonthlyDay: org.payroll_semimonthly_day,
    payrollMonthlyStartDay: org.payroll_monthly_start_day,
  };
  const today = todayInTimeZone(org.timezone);

  const orgResolved = resolveOrgPayPeriodConfig(orgRow);
  const orgSummary = describeConfig(orgResolved.config);
  const orgCurrentLabel = getPayPeriodForDate(orgResolved.config, today).label;

  const out = new Map<string, ProjectPayPeriodView>();
  for (const p of projects) {
    const projectRow: ProjectPayrollRow = {
      payrollPeriodOverride: p.payroll_period_override,
      payrollStartWeekday: p.payroll_start_weekday,
      payrollAnchorDate: p.payroll_anchor_date ? dateOnly(p.payroll_anchor_date) : null,
      payrollSemimonthlyDay: p.payroll_semimonthly_day,
      payrollMonthlyStartDay: p.payroll_monthly_start_day,
    };
    const hasOverride = projectRow.payrollPeriodOverride != null;
    const effective = resolveEffectivePayPeriodConfig(orgRow, projectRow);

    out.set(p.id, {
      hasOverride,
      source: effective.source,
      effectiveSummary: describeConfig(effective.config),
      effectiveCurrentLabel: getPayPeriodForDate(effective.config, today).label,
      orgSummary,
      orgCurrentLabel,
      formDefaults: configToFieldValues(hasOverride ? effective.config : orgResolved.config),
    });
  }
  return out;
}
