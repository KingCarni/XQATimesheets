import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Avatar storage service. Like contract attachments, avatar bytes live in
 * Postgres (`employee_avatars.image_bytes`, a bytea) so no external storage
 * infra or new env vars are needed, and the domain/UI layers only touch these
 * helpers so the backend can be swapped later.
 *
 * Avatars are directory-safe: any authenticated employee may view any active
 * colleague's avatar (served only through the authenticated route handler at
 * `app/api/avatars/[profileId]/route.ts`). This is intentionally MORE open
 * than contract attachments and does not weaken contract rules.
 */

export const ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** 1 MB cap — avatars are small; keeps Postgres rows lean. */
export const MAX_AVATAR_BYTES = 1024 * 1024;

export class AvatarValidationError extends Error {}

export function validateAvatarUpload(input: { mimeType: string; sizeBytes: number }): void {
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
    throw new AvatarValidationError("Use a PNG, JPEG, or WebP image.");
  }
  if (input.sizeBytes <= 0) throw new AvatarValidationError("The image is empty.");
  if (input.sizeBytes > MAX_AVATAR_BYTES) throw new AvatarValidationError("The image exceeds the 1 MB limit.");
}

type TxLike = Pick<typeof prisma, "employee_avatars" | "employee_profiles">;

/**
 * Upsert an employee's avatar bytes and stamp `avatar_updated_at` on the
 * profile (a cache-buster + "has avatar" flag). Runs in the caller's tx.
 */
export async function saveAvatar(
  input: { profileId: string; mimeType: string; bytes: Uint8Array },
  tx: TxLike = prisma,
): Promise<void> {
  validateAvatarUpload({ mimeType: input.mimeType, sizeBytes: input.bytes.length });
  const image = new Uint8Array(input.bytes);

  await tx.employee_avatars.upsert({
    where: { employee_profile_id: input.profileId },
    create: {
      employee_profile_id: input.profileId,
      mime_type: input.mimeType,
      size_bytes: image.length,
      image_bytes: image,
    },
    update: { mime_type: input.mimeType, size_bytes: image.length, image_bytes: image },
  });
  await tx.employee_profiles.update({
    where: { id: input.profileId },
    data: { avatar_updated_at: new Date() },
  });
}

export async function getAvatarBytes(
  profileId: string,
): Promise<{ mimeType: string; bytes: Buffer; updatedAt: Date } | null> {
  const row = await prisma.employee_avatars.findUnique({
    where: { employee_profile_id: profileId },
    select: { mime_type: true, image_bytes: true, updated_at: true },
  });
  if (!row) return null;
  return { mimeType: row.mime_type, bytes: Buffer.from(row.image_bytes), updatedAt: row.updated_at };
}
