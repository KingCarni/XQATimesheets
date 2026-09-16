import "server-only";

import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/authorization";
import type { CurrentUser } from "@/lib/auth/session";
import { dateOnly, timestamp } from "@/lib/timesheets/queries";
import type { ContractStatus } from "@/types/domain";

/**
 * Contracts are sensitive employment records. Access is intentionally NARROW:
 * the owning employee (their own contracts) and admins only. A manager does
 * NOT gain access merely because of their role — contracts are outside the
 * project-scoped review model that governs timesheets/PTO.
 */
export function canViewContractsForProfile(user: CurrentUser, profileId: string): boolean {
  if (isAdmin(user.role)) return true;
  return user.profile?.id === profileId;
}

export type ContractAttachmentDto = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type ContractDto = {
  id: string;
  title: string;
  contractType: string | null;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
  notes: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: ContractAttachmentDto[];
};

function isCurrentContract(status: ContractStatus, startDate: Date, endDate: Date | null): boolean {
  if (status !== "active") return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

export async function getContractsForProfile(profileId: string, organizationId: string): Promise<ContractDto[]> {
  const rows = await prisma.employee_contracts.findMany({
    where: { employee_profile_id: profileId, organization_id: organizationId },
    include: {
      attachments: {
        orderBy: { uploaded_at: "desc" },
        select: {
          id: true,
          original_filename: true,
          mime_type: true,
          size_bytes: true,
          uploaded_at: true,
        },
      },
    },
    orderBy: [{ start_date: "desc" }, { created_at: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    contractType: row.contract_type,
    startDate: dateOnly(row.start_date),
    endDate: row.end_date ? dateOnly(row.end_date) : null,
    status: row.status,
    notes: row.notes,
    isCurrent: isCurrentContract(row.status, row.start_date, row.end_date),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      originalFilename: a.original_filename,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      uploadedAt: a.uploaded_at.toISOString(),
    })),
  }));
}

/**
 * Authorization gate for downloading a single attachment. Resolves the
 * attachment to its owning employee profile and applies the contract-access
 * rule (owner or admin only). Returns null when the attachment does not exist
 * OR the requester is not authorized — callers should not distinguish the two.
 */
export async function resolveDownloadableAttachment(
  user: CurrentUser,
  attachmentId: string,
  organizationId: string,
): Promise<{ ownerProfileId: string } | null> {
  // Scope the attachment lookup to the current organization first — an id from
  // another tenant simply does not exist here.
  const attachment = await prisma.contract_attachments.findFirst({
    where: { id: attachmentId, organization_id: organizationId },
    select: { contract: { select: { employee_profile_id: true } } },
  });
  if (!attachment) return null;

  const ownerProfileId = attachment.contract.employee_profile_id;
  if (!canViewContractsForProfile(user, ownerProfileId)) return null;
  return { ownerProfileId };
}
