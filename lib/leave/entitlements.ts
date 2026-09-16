import "server-only";

import { prisma } from "@/lib/prisma";
import { decimal } from "@/lib/timesheets/queries";

/**
 * Admin-managed leave balances. This is intentionally NOT a payroll-grade
 * accrual engine: entitlement hours are set by an admin per employee per
 * leave type (an `is_pto` activity type), "used" is derived from approved PTO
 * requests in the current calendar year, and remaining = entitlement − used.
 * There is no monthly accrual or holiday/payroll logic.
 *
 * Keyed by `activity_type_id` (one row per leave type) so new leave categories
 * are supported by configuring another type — never by adding a DB column.
 */

export type LeaveBalanceDto = {
  activityTypeId: string;
  typeName: string;
  entitlementHours: number | null;
  usedHours: number;
  remainingHours: number | null;
  note: string | null;
};

function currentYearRange(): { start: Date; end: Date } {
  const year = new Date().getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}

export async function getLeaveBalancesForProfile(
  profileId: string,
  organizationId: string,
): Promise<LeaveBalanceDto[]> {
  const { start, end } = currentYearRange();

  const [entitlements, usageRows, ptoTypes] = await Promise.all([
    prisma.leave_entitlements.findMany({
      where: { employee_profile_id: profileId, organization_id: organizationId },
      include: { activity_type: { select: { id: true, name: true, sort_order: true } } },
    }),
    prisma.pto_requests.groupBy({
      by: ["activity_type_id"],
      where: {
        employee_profile_id: profileId,
        organization_id: organizationId,
        status: "approved",
        start_date: { gte: start, lte: end },
      },
      _sum: { total_hours: true },
    }),
    prisma.activity_types.findMany({
      where: { is_pto: true, organization_id: organizationId },
      select: { id: true, name: true, sort_order: true },
    }),
  ]);

  const typeById = new Map(ptoTypes.map((t) => [t.id, t]));
  const usedByType = new Map(
    usageRows.map((r) => [r.activity_type_id, r._sum.total_hours ? decimal(r._sum.total_hours) : 0]),
  );
  const entitlementByType = new Map(entitlements.map((e) => [e.activity_type_id, e]));

  // Union of types that have an entitlement configured OR any usage this year.
  const relevantTypeIds = new Set<string>([...entitlementByType.keys(), ...usedByType.keys()]);

  const rows: LeaveBalanceDto[] = [];
  for (const typeId of relevantTypeIds) {
    const entitlement = entitlementByType.get(typeId);
    const type = entitlement?.activity_type ?? typeById.get(typeId);
    if (!type) continue;
    const entitlementHours = entitlement ? decimal(entitlement.hours) : null;
    const usedHours = usedByType.get(typeId) ?? 0;
    rows.push({
      activityTypeId: typeId,
      typeName: type.name,
      entitlementHours,
      usedHours,
      remainingHours: entitlementHours === null ? null : Math.round((entitlementHours - usedHours) * 100) / 100,
      note: entitlement?.note ?? null,
    });
  }

  return rows.sort((a, b) => {
    const sa = typeById.get(a.activityTypeId)?.sort_order ?? 0;
    const sb = typeById.get(b.activityTypeId)?.sort_order ?? 0;
    return sa - sb || a.typeName.localeCompare(b.typeName);
  });
}
