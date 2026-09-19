import "server-only";

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { timestamp } from "@/lib/timesheets/queries";
import type { HardwareRequestStatus } from "@/types/domain";

/**
 * Hardware requests are submitted by employees for themselves and reviewed by
 * admins under Approvals > Hardware Requests. Review is admin-only — a manager
 * does not gain review rights from their role.
 */
export function canReviewHardwareRequests(user: CurrentUser): boolean {
  return isAdmin(user.role);
}

export type HardwareRequestDto = {
  id: string;
  details: string;
  category: string | null;
  status: HardwareRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewerEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminHardwareRequestDto = HardwareRequestDto & {
  employeeName: string;
  employeeEmail: string;
  employeeProfileId: string;
};

export async function getOwnHardwareRequests(profileId: string, organizationId: string): Promise<HardwareRequestDto[]> {
  const rows = await prisma.hardware_requests.findMany({
    where: { employee_profile_id: profileId, organization_id: organizationId },
    include: { reviewer: { select: { email: true } } },
    orderBy: { created_at: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    details: row.details,
    category: row.category,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at ? timestamp(row.reviewed_at) : null,
    reviewerEmail: row.reviewer?.email ?? null,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  }));
}

/** Admin-wide hardware request queue for one organization. Optional status filter. */
export async function getAllHardwareRequests(
  organizationId: string,
  filterStatus?: HardwareRequestStatus | "all",
): Promise<AdminHardwareRequestDto[]> {
  const rows = await prisma.hardware_requests.findMany({
    where: {
      organization_id: organizationId,
      ...(filterStatus && filterStatus !== "all" ? { status: filterStatus } : {}),
    },
    include: {
      reviewer: { select: { email: true } },
      employee_profile: { select: { id: true, full_name: true, user: { select: { email: true } } } },
    },
    orderBy: [{ status: "asc" }, { created_at: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    details: row.details,
    category: row.category,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at ? timestamp(row.reviewed_at) : null,
    reviewerEmail: row.reviewer?.email ?? null,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    employeeName: row.employee_profile.full_name,
    employeeEmail: row.employee_profile.user.email,
    employeeProfileId: row.employee_profile.id,
  }));
}
