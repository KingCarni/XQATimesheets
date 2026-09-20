import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import { validatePayPeriodConfig, type Cadence } from "@/lib/pay-periods/calc";
import {
  inputToColumns,
  inputToConfig,
  isUsingPayrollFallback,
  payPeriodSettingsSchema,
} from "@/lib/pay-periods/config";

/** Current stored payroll settings for the admin settings screen. */
export type PayPeriodSettings = {
  cadence: Cadence | null;
  startWeekday: number | null;
  anchor: string | null;
  splitDay: number | null;
  monthlyStartDay: number | null;
  timezone: string;
  isFallback: boolean;
};

const ORG_PAYROLL_SELECT = {
  payroll_period: true,
  payroll_start_weekday: true,
  payroll_anchor_date: true,
  payroll_semimonthly_day: true,
  payroll_monthly_start_day: true,
} as const;

export async function getPayPeriodSettings(organizationId: string): Promise<PayPeriodSettings> {
  const org = await prisma.organizations.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true, ...ORG_PAYROLL_SELECT },
  });

  return {
    cadence: org.payroll_period,
    startWeekday: org.payroll_start_weekday,
    anchor: org.payroll_anchor_date ? dateOnly(org.payroll_anchor_date) : null,
    splitDay: org.payroll_semimonthly_day,
    monthlyStartDay: org.payroll_monthly_start_day,
    timezone: org.timezone,
    isFallback: isUsingPayrollFallback({ payrollPeriod: org.payroll_period }),
  };
}

/** Raw form values for the payroll settings action. */
export type PayPeriodSettingsFormInput = {
  cadence: string;
  startWeekday?: string;
  anchor?: string;
  splitDay?: string;
  monthlyStartDay?: string;
};

/**
 * Validate and persist an organization's payroll configuration, recording an
 * audit entry (before/after) in the same transaction. All writes are scoped to
 * `organizationId`; there is no cross-tenant path. Authorization (admin-only +
 * demo-writable) is enforced by the calling server action.
 */
export async function updatePayPeriodSettings(
  organizationId: string,
  actorUserId: string,
  raw: PayPeriodSettingsFormInput,
): Promise<void> {
  const parsed = payPeriodSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid payroll configuration.");
  }

  // Cross-field validation (e.g. biweekly anchor must fall on the start weekday).
  const configCheck = validatePayPeriodConfig(inputToConfig(parsed.data));
  if (!configCheck.ok) throw new Error(configCheck.error);

  const columns = inputToColumns(parsed.data);

  const before = await prisma.organizations.findUniqueOrThrow({
    where: { id: organizationId },
    select: ORG_PAYROLL_SELECT,
  });

  const beforeState = {
    payroll_period: before.payroll_period,
    payroll_start_weekday: before.payroll_start_weekday,
    payroll_anchor_date: before.payroll_anchor_date ? dateOnly(before.payroll_anchor_date) : null,
    payroll_semimonthly_day: before.payroll_semimonthly_day,
    payroll_monthly_start_day: before.payroll_monthly_start_day,
  };
  const afterState = {
    payroll_period: columns.payrollPeriod,
    payroll_start_weekday: columns.payrollStartWeekday,
    payroll_anchor_date: columns.payrollAnchorDate,
    payroll_semimonthly_day: columns.payrollSemimonthlyDay,
    payroll_monthly_start_day: columns.payrollMonthlyStartDay,
  };

  await prisma.$transaction([
    prisma.organizations.update({
      where: { id: organizationId },
      data: {
        payroll_period: columns.payrollPeriod,
        payroll_start_weekday: columns.payrollStartWeekday,
        payroll_anchor_date: columns.payrollAnchorDate ? new Date(`${columns.payrollAnchorDate}T00:00:00.000Z`) : null,
        payroll_semimonthly_day: columns.payrollSemimonthlyDay,
        payroll_monthly_start_day: columns.payrollMonthlyStartDay,
      },
    }),
    prisma.audit_history.create({
      data: {
        entity_type: "organization",
        entity_id: organizationId,
        action: "payroll_period_updated",
        actor_user_id: actorUserId,
        organization_id: organizationId,
        before_state: beforeState,
        after_state: afterState,
      },
    }),
  ]);
}
