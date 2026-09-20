import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import { validatePayPeriodConfig } from "@/lib/pay-periods/calc";
import { inputToColumns, inputToConfig, payPeriodSettingsSchema } from "@/lib/pay-periods/config";

const PROJECT_PAYROLL_SELECT = {
  payroll_period_override: true,
  payroll_start_weekday: true,
  payroll_anchor_date: true,
  payroll_semimonthly_day: true,
  payroll_monthly_start_day: true,
} as const;

function snapshot(row: {
  payroll_period_override: string | null;
  payroll_start_weekday: number | null;
  payroll_anchor_date: Date | null;
  payroll_semimonthly_day: number | null;
  payroll_monthly_start_day: number | null;
}) {
  return {
    payroll_period_override: row.payroll_period_override,
    payroll_start_weekday: row.payroll_start_weekday,
    payroll_anchor_date: row.payroll_anchor_date ? dateOnly(row.payroll_anchor_date) : null,
    payroll_semimonthly_day: row.payroll_semimonthly_day,
    payroll_monthly_start_day: row.payroll_monthly_start_day,
  };
}

/** All override columns cleared — the project inherits the organization config. */
const CLEARED = {
  payroll_period_override: null,
  payroll_start_weekday: null,
  payroll_anchor_date: null,
  payroll_semimonthly_day: null,
  payroll_monthly_start_day: null,
} as const;

export type ProjectPayPeriodFormInput = {
  mode: string; // "inherit" | "custom"
  cadence?: string;
  startWeekday?: string;
  anchor?: string;
  splitDay?: string;
  monthlyStartDay?: string;
};

/**
 * Enable/disable/update a project's payroll override. Tenant-scoped (the project
 * must belong to `organizationId`) and audited. Disabling the override CLEARS the
 * stored custom fields so a stale configuration can never accidentally resurrect;
 * the previous custom state is preserved in the audit `before_state`.
 * Authorization (org admin + demo-writable) is enforced by the calling action.
 */
export async function updateProjectPayPeriod(
  organizationId: string,
  actorUserId: string,
  projectId: string,
  raw: ProjectPayPeriodFormInput,
): Promise<void> {
  const before = await prisma.projects.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: PROJECT_PAYROLL_SELECT,
  });
  if (!before) throw new Error("Project not found.");

  const useCustom = raw.mode === "custom";
  let data: Record<string, unknown>;

  if (useCustom) {
    const parsed = payPeriodSettingsSchema.safeParse({
      cadence: raw.cadence,
      startWeekday: raw.startWeekday,
      anchor: raw.anchor,
      splitDay: raw.splitDay,
      monthlyStartDay: raw.monthlyStartDay,
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid pay-period configuration.");
    }
    const check = validatePayPeriodConfig(inputToConfig(parsed.data));
    if (!check.ok) throw new Error(check.error);

    const cols = inputToColumns(parsed.data);
    data = {
      payroll_period_override: cols.payrollPeriod,
      payroll_start_weekday: cols.payrollStartWeekday,
      payroll_anchor_date: cols.payrollAnchorDate ? new Date(`${cols.payrollAnchorDate}T00:00:00.000Z`) : null,
      payroll_semimonthly_day: cols.payrollSemimonthlyDay,
      payroll_monthly_start_day: cols.payrollMonthlyStartDay,
    };
  } else {
    data = { ...CLEARED };
  }

  const wasOverride = before.payroll_period_override != null;
  const beforeState = snapshot(before);
  const afterState = useCustom
    ? {
        payroll_period_override: data.payroll_period_override as string | null,
        payroll_start_weekday: data.payroll_start_weekday as number | null,
        payroll_anchor_date: (data.payroll_anchor_date as Date | null)
          ? dateOnly(data.payroll_anchor_date as Date)
          : null,
        payroll_semimonthly_day: data.payroll_semimonthly_day as number | null,
        payroll_monthly_start_day: data.payroll_monthly_start_day as number | null,
      }
    : snapshot({ ...CLEARED, payroll_anchor_date: null });

  await prisma.$transaction(async (tx) => {
    const res = await tx.projects.updateMany({
      where: { id: projectId, organization_id: organizationId },
      data,
    });
    if (res.count !== 1) throw new Error("Project not found.");

    await tx.audit_history.create({
      data: {
        entity_type: "project",
        entity_id: projectId,
        action: "project_payroll_period_updated",
        actor_user_id: actorUserId,
        organization_id: organizationId,
        before_state: beforeState,
        after_state: afterState,
        metadata: {
          override_before: wasOverride,
          override_after: useCustom,
        },
      },
    });
  });
}
