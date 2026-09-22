import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import type { EquipmentStatus } from "@/types/domain";

import {
  filterInventory,
  sortInventoryForDisplay,
  summarizeInventory,
  type EquipmentInventoryFilters,
  type EquipmentInventoryRow,
  type EquipmentInventorySummary,
} from "./inventory-shape";

export * from "./inventory-shape";

/**
 * MHV-7 tenant-scoped inventory fetch. One batched query with employee_profile
 * + user joins so the caller never lazy-fetches per row. History rows
 * (`returned`, `retired`) are included by default — the ticket says historical
 * assignments must remain visible. Applying filters after the DB fetch keeps
 * the shape module purely testable and, since inventory volume is bounded,
 * has no meaningful performance impact.
 */
export async function listOrganizationEquipment(
  organizationId: string,
  filters: EquipmentInventoryFilters = {},
): Promise<{ rows: EquipmentInventoryRow[]; summary: EquipmentInventorySummary }> {
  const rowsRaw = await prisma.equipment_assignments.findMany({
    where: { organization_id: organizationId },
    include: {
      employee_profile: {
        select: { id: true, full_name: true, user: { select: { email: true } } },
      },
    },
  });
  const mapped: EquipmentInventoryRow[] = rowsRaw.map((r) => ({
    id: r.id,
    name: r.name,
    assetTag: r.asset_tag,
    status: r.status as EquipmentStatus,
    issuedOn: r.issued_on ? dateOnly(r.issued_on) : null,
    returnedOn: r.returned_on ? dateOnly(r.returned_on) : null,
    notes: r.notes,
    employeeProfileId: r.employee_profile.id,
    employeeName: r.employee_profile.full_name,
    employeeEmail: r.employee_profile.user?.email ?? "",
  }));
  const filtered = sortInventoryForDisplay(filterInventory(mapped, filters));
  return { rows: filtered, summary: summarizeInventory(filtered) };
}

/** Distinct employee dropdown, tenant-scoped, in name order. */
export async function listInventoryEmployeeOptions(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.employee_profiles.findMany({
    where: {
      organization_id: organizationId,
      equipment_assignments: { some: { organization_id: organizationId } },
    },
    select: { id: true, full_name: true },
    orderBy: { full_name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.full_name }));
}
