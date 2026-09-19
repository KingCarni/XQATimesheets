import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly, decimal, timestamp } from "@/lib/timesheets/queries";
import type { ContractDto } from "@/lib/contracts/queries";
import type { EquipmentDto } from "@/lib/equipment/queries";
import type { ContractStatus, EquipmentStatus } from "@/types/domain";

export type EntitlementDto = { activityTypeId: string; typeName: string; hours: number; note: string | null };

export type EmployeeAnalytics = {
  totalHours: number;
  approvedHours: number;
  byProject: { label: string; hours: number }[];
  byActivity: { label: string; hours: number }[];
  ptoUsedByType: { label: string; hours: number }[];
};

export type EmployeeWorkforce = {
  contracts: ContractDto[];
  equipment: EquipmentDto[];
  entitlements: EntitlementDto[];
  analytics: EmployeeAnalytics;
};

export type AdminWorkforceData = {
  byProfile: Record<string, EmployeeWorkforce>;
  ptoTypes: { id: string; name: string }[];
};

function isCurrentContract(status: ContractStatus, startDate: Date, endDate: Date | null): boolean {
  if (status !== "active") return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

function currentYearRange(): { start: Date; end: Date } {
  const year = new Date().getUTCFullYear();
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) };
}

/**
 * Batched workforce data for the admin Employees screen. Everything is loaded
 * with a handful of `in`/`groupBy` queries and grouped in memory rather than
 * per-employee, so cost stays roughly constant in the number of employees.
 */
export async function getAdminWorkforceData(
  profileIds: string[],
  organizationId: string,
): Promise<AdminWorkforceData> {
  const empty: AdminWorkforceData = { byProfile: {}, ptoTypes: [] };
  if (profileIds.length === 0) return empty;

  const { start, end } = currentYearRange();

  const [
    contracts,
    equipment,
    entitlements,
    ptoTypes,
    totals,
    approvedTotals,
    byProjectRaw,
    byActivityRaw,
    ptoUsedRaw,
  ] = await Promise.all([
    prisma.employee_contracts.findMany({
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId },
      include: {
        attachments: {
          orderBy: { uploaded_at: "desc" },
          select: { id: true, original_filename: true, mime_type: true, size_bytes: true, uploaded_at: true },
        },
      },
      orderBy: [{ start_date: "desc" }, { created_at: "desc" }],
    }),
    prisma.equipment_assignments.findMany({
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId },
      orderBy: [{ status: "asc" }, { issued_on: "desc" }, { created_at: "desc" }],
    }),
    prisma.leave_entitlements.findMany({
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId },
      include: { activity_type: { select: { name: true } } },
    }),
    prisma.activity_types.findMany({
      where: { is_pto: true, is_active: true, organization_id: organizationId },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.time_entries.groupBy({
      by: ["employee_profile_id"],
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId },
      _sum: { hours: true },
    }),
    prisma.time_entries.groupBy({
      by: ["employee_profile_id"],
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId, timesheet_period: { status: "approved" } },
      _sum: { hours: true },
    }),
    prisma.time_entries.groupBy({
      by: ["employee_profile_id", "project_id"],
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId, timesheet_period: { status: "approved" } },
      _sum: { hours: true },
    }),
    prisma.time_entries.groupBy({
      by: ["employee_profile_id", "activity_type_id"],
      where: { employee_profile_id: { in: profileIds }, organization_id: organizationId, timesheet_period: { status: "approved" } },
      _sum: { hours: true },
    }),
    prisma.pto_requests.groupBy({
      by: ["employee_profile_id", "activity_type_id"],
      where: {
        employee_profile_id: { in: profileIds },
        organization_id: organizationId,
        status: "approved",
        start_date: { gte: start, lte: end },
      },
      _sum: { total_hours: true },
    }),
  ]);

  // Label maps for the grouped ids.
  const projectIds = [...new Set(byProjectRaw.map((r) => r.project_id).filter((v): v is string => Boolean(v)))];
  const activityIds = [
    ...new Set([
      ...byActivityRaw.map((r) => r.activity_type_id),
      ...ptoUsedRaw.map((r) => r.activity_type_id),
    ]),
  ];
  const [projectRows, activityRows] = await Promise.all([
    projectIds.length
      ? prisma.projects.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    activityIds.length
      ? prisma.activity_types.findMany({ where: { id: { in: activityIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
  const activityName = new Map(activityRows.map((a) => [a.id, a.name]));

  const byProfile: Record<string, EmployeeWorkforce> = {};
  const ensure = (id: string): EmployeeWorkforce => {
    const found = byProfile[id];
    if (found) return found;
    const created: EmployeeWorkforce = {
      contracts: [],
      equipment: [],
      entitlements: [],
      analytics: { totalHours: 0, approvedHours: 0, byProject: [], byActivity: [], ptoUsedByType: [] },
    };
    byProfile[id] = created;
    return created;
  };
  for (const id of profileIds) ensure(id);

  for (const c of contracts) {
    ensure(c.employee_profile_id).contracts.push({
      id: c.id,
      title: c.title,
      contractType: c.contract_type,
      startDate: dateOnly(c.start_date),
      endDate: c.end_date ? dateOnly(c.end_date) : null,
      status: c.status as ContractStatus,
      notes: c.notes,
      isCurrent: isCurrentContract(c.status as ContractStatus, c.start_date, c.end_date),
      createdAt: timestamp(c.created_at),
      updatedAt: timestamp(c.updated_at),
      attachments: c.attachments.map((a) => ({
        id: a.id,
        originalFilename: a.original_filename,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        uploadedAt: a.uploaded_at.toISOString(),
      })),
    });
  }

  for (const e of equipment) {
    ensure(e.employee_profile_id).equipment.push({
      id: e.id,
      name: e.name,
      assetTag: e.asset_tag,
      status: e.status as EquipmentStatus,
      issuedOn: e.issued_on ? dateOnly(e.issued_on) : null,
      returnedOn: e.returned_on ? dateOnly(e.returned_on) : null,
      notes: e.notes,
      createdAt: timestamp(e.created_at),
      updatedAt: timestamp(e.updated_at),
    });
  }

  for (const ent of entitlements) {
    ensure(ent.employee_profile_id).entitlements.push({
      activityTypeId: ent.activity_type_id,
      typeName: ent.activity_type.name,
      hours: decimal(ent.hours),
      note: ent.note,
    });
  }

  for (const t of totals) {
    ensure(t.employee_profile_id).analytics.totalHours = t._sum.hours ? decimal(t._sum.hours) : 0;
  }
  for (const t of approvedTotals) {
    ensure(t.employee_profile_id).analytics.approvedHours = t._sum.hours ? decimal(t._sum.hours) : 0;
  }
  for (const r of byProjectRaw) {
    const hours = r._sum.hours ? decimal(r._sum.hours) : 0;
    if (hours <= 0) continue;
    ensure(r.employee_profile_id).analytics.byProject.push({
      label: r.project_id ? projectName.get(r.project_id) ?? "Unknown" : "No project",
      hours,
    });
  }
  for (const r of byActivityRaw) {
    const hours = r._sum.hours ? decimal(r._sum.hours) : 0;
    if (hours <= 0) continue;
    ensure(r.employee_profile_id).analytics.byActivity.push({
      label: activityName.get(r.activity_type_id) ?? "Unknown",
      hours,
    });
  }
  for (const r of ptoUsedRaw) {
    const hours = r._sum.total_hours ? decimal(r._sum.total_hours) : 0;
    if (hours <= 0) continue;
    ensure(r.employee_profile_id).analytics.ptoUsedByType.push({
      label: activityName.get(r.activity_type_id) ?? "Unknown",
      hours,
    });
  }

  // Sort breakdowns high→low for stable, meaningful display.
  for (const wf of Object.values(byProfile)) {
    wf.analytics.byProject.sort((a, b) => b.hours - a.hours);
    wf.analytics.byActivity.sort((a, b) => b.hours - a.hours);
    wf.analytics.ptoUsedByType.sort((a, b) => b.hours - a.hours);
  }

  return { byProfile, ptoTypes };
}
