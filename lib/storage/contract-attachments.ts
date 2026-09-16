import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Contract-attachment storage service.
 *
 * This is a deliberately small abstraction over *where* the attachment bytes
 * live. For this pass the bytes are stored in Postgres (`contract_attachments.
 * file_bytes`, a `bytea` column) so no external storage infrastructure or new
 * environment variables are required. The domain/UI layers only ever touch the
 * functions in this module, so the backend can later be swapped to S3 / Vercel
 * Blob (store an object key instead of the bytes) without changing callers.
 *
 * Downloads must only ever be served through the authenticated route handler
 * at `app/api/contracts/attachments/[attachmentId]/route.ts`, which enforces
 * authorization. Nothing here produces a public URL.
 */

/** PDF-only for v1. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = ["application/pdf"] as const;

/** 5 MB hard cap, enforced server-side. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type AttachmentMetadata = {
  id: string;
  contractId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByUserId: string | null;
};

export type AttachmentUpload = {
  contractId: string;
  organizationId: string;
  originalFilename: string;
  mimeType: string;
  bytes: Uint8Array;
  uploadedByUserId: string;
};

export class AttachmentValidationError extends Error {}

/** Validate an upload against the MIME-type allowlist and size cap. */
export function validateAttachmentUpload(input: {
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number])) {
    throw new AttachmentValidationError("Only PDF files are allowed.");
  }
  if (input.sizeBytes <= 0) {
    throw new AttachmentValidationError("The file is empty.");
  }
  if (input.sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentValidationError("The file exceeds the 5 MB limit.");
  }
}

/**
 * Persist attachment bytes + metadata. Validates before writing. Runs inside
 * the caller's Prisma transaction when one is supplied so the attachment and
 * its owning contract commit atomically.
 */
export async function saveAttachment(
  upload: AttachmentUpload,
  tx: Pick<typeof prisma, "contract_attachments"> = prisma,
): Promise<AttachmentMetadata> {
  validateAttachmentUpload({ mimeType: upload.mimeType, sizeBytes: upload.bytes.length });

  const row = await tx.contract_attachments.create({
    data: {
      contract_id: upload.contractId,
      organization_id: upload.organizationId,
      original_filename: upload.originalFilename,
      mime_type: upload.mimeType,
      size_bytes: upload.bytes.length,
      // Copy into a fresh ArrayBuffer-backed view so the type matches Prisma's
      // Bytes column (Uint8Array<ArrayBuffer>) regardless of the source buffer.
      file_bytes: new Uint8Array(upload.bytes),
      uploaded_by_user_id: upload.uploadedByUserId,
    },
    select: {
      id: true,
      contract_id: true,
      original_filename: true,
      mime_type: true,
      size_bytes: true,
      uploaded_at: true,
      uploaded_by_user_id: true,
    },
  });

  return toMetadata(row);
}

/** Fetch only metadata (no bytes) — cheap, safe to list. */
export async function getAttachmentMetadata(attachmentId: string): Promise<AttachmentMetadata | null> {
  const row = await prisma.contract_attachments.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      contract_id: true,
      original_filename: true,
      mime_type: true,
      size_bytes: true,
      uploaded_at: true,
      uploaded_by_user_id: true,
    },
  });
  return row ? toMetadata(row) : null;
}

/**
 * Fetch the raw bytes + metadata for a download. Callers MUST have already
 * authorized the requester against the owning contract's employee.
 */
export async function getAttachmentBytes(
  attachmentId: string,
): Promise<(AttachmentMetadata & { bytes: Buffer }) | null> {
  const row = await prisma.contract_attachments.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      contract_id: true,
      original_filename: true,
      mime_type: true,
      size_bytes: true,
      uploaded_at: true,
      uploaded_by_user_id: true,
      file_bytes: true,
    },
  });
  if (!row) return null;
  return { ...toMetadata(row), bytes: Buffer.from(row.file_bytes) };
}

function toMetadata(row: {
  id: string;
  contract_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: Date;
  uploaded_by_user_id: string | null;
}): AttachmentMetadata {
  return {
    id: row.id,
    contractId: row.contract_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedByUserId: row.uploaded_by_user_id,
  };
}
