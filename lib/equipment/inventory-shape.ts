/**
 * MHV-7 pure helpers for the equipment inventory report — filter and search
 * semantics that the UI, export, and unit tests all share.
 *
 * The domain model does NOT carry equipment_type, serial number, or project;
 * only `name`, `asset_tag`, `status`, and assignment/return dates. So this
 * module intentionally exposes filters for what the schema actually has:
 * status, employee, and free-text search over name + asset tag. It also does
 * NOT invent statuses — the existing enum is `assigned | returned | retired`.
 */

import type { EquipmentStatus } from "@/types/domain";

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  assigned: "Assigned",
  returned: "Returned",
  retired: "Retired",
};

export type EquipmentInventoryRow = {
  id: string;
  name: string;
  assetTag: string | null;
  status: EquipmentStatus;
  issuedOn: string | null;
  returnedOn: string | null;
  notes: string | null;
  employeeProfileId: string;
  employeeName: string;
  employeeEmail: string;
};

export type EquipmentInventoryFilters = {
  status?: EquipmentStatus | "all";
  employeeProfileId?: string;
  /** Free-text case-insensitive substring match over name + asset tag. */
  search?: string;
};

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/**
 * Filter rows client-side after the tenant-scoped DB fetch. Keeping this pure
 * makes URL-driven filter behavior easy to verify without a database.
 */
export function filterInventory(
  rows: EquipmentInventoryRow[],
  filters: EquipmentInventoryFilters,
): EquipmentInventoryRow[] {
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const employeeId = filters.employeeProfileId?.trim() || null;
  const q = filters.search?.trim().toLowerCase() ?? "";

  return rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (employeeId && r.employeeProfileId !== employeeId) return false;
    if (q) {
      if (!normalize(r.name).includes(q) && !normalize(r.assetTag).includes(q)) return false;
    }
    return true;
  });
}

export type EquipmentInventorySummary = {
  total: number;
  assigned: number;
  returned: number;
  retired: number;
  employees: number;
};

export function summarizeInventory(rows: EquipmentInventoryRow[]): EquipmentInventorySummary {
  const employees = new Set<string>();
  let assigned = 0;
  let returned = 0;
  let retired = 0;
  for (const r of rows) {
    employees.add(r.employeeProfileId);
    if (r.status === "assigned") assigned += 1;
    else if (r.status === "returned") returned += 1;
    else retired += 1;
  }
  return { total: rows.length, assigned, returned, retired, employees: employees.size };
}

/**
 * Sort matches the existing `getEquipmentForProfile` ordering pattern
 * (currently assigned first, then most recently issued, then created) so the
 * inventory report opens with actionable rows on top.
 */
export function sortInventoryForDisplay(
  rows: EquipmentInventoryRow[],
): EquipmentInventoryRow[] {
  const statusRank: Record<EquipmentStatus, number> = { assigned: 0, returned: 1, retired: 2 };
  return [...rows].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status];
    const ai = a.issuedOn ?? "";
    const bi = b.issuedOn ?? "";
    if (ai !== bi) return bi.localeCompare(ai);
    return a.name.localeCompare(b.name);
  });
}

export function inventoryExportFilename(orgSlug: string, ext: "xlsx" | "csv"): string {
  return `${orgSlug}-equipment-inventory.${ext}`;
}
