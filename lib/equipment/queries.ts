import "server-only";

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { dateOnly, timestamp } from "@/lib/timesheets/queries";
import type { EquipmentStatus } from "@/types/domain";

/**
 * Equipment assignments are admin-managed. Employees may VIEW their own
 * assigned equipment and history; they may never edit it. Managers have no
 * special access by role.
 */
export function canManageEquipment(user: CurrentUser): boolean {
  return isAdmin(user.role);
}

export function canViewEquipmentForProfile(user: CurrentUser, profileId: string): boolean {
  if (isAdmin(user.role)) return true;
  return user.profile?.id === profileId;
}

export type EquipmentDto = {
  id: string;
  name: string;
  assetTag: string | null;
  status: EquipmentStatus;
  issuedOn: string | null;
  returnedOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDto(row: {
  id: string;
  name: string;
  asset_tag: string | null;
  status: EquipmentStatus;
  issued_on: Date | null;
  returned_on: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}): EquipmentDto {
  return {
    id: row.id,
    name: row.name,
    assetTag: row.asset_tag,
    status: row.status,
    issuedOn: row.issued_on ? dateOnly(row.issued_on) : null,
    returnedOn: row.returned_on ? dateOnly(row.returned_on) : null,
    notes: row.notes,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

export async function getEquipmentForProfile(profileId: string, organizationId: string): Promise<EquipmentDto[]> {
  const rows = await prisma.equipment_assignments.findMany({
    where: { employee_profile_id: profileId, organization_id: organizationId },
    orderBy: [{ status: "asc" }, { issued_on: "desc" }, { created_at: "desc" }],
  });
  return rows.map(toDto);
}
