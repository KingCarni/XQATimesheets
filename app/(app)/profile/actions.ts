"use server";

import { revalidatePath } from "next/cache";

import { requireWritableOrganizationContext } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { HARDWARE_REQUEST_MAX_LENGTH } from "@/types/domain";
import { AvatarValidationError, MAX_AVATAR_BYTES, saveAvatar, validateAvatarUpload } from "@/lib/storage/avatars";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Accepts empty, or an http(s) URL on a linkedin.com host. */
function normalizeLinkedIn(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("LinkedIn URL must be a full https://… link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("LinkedIn URL must start with https://");
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    throw new Error("That doesn't look like a linkedin.com URL.");
  }
  return url.toString();
}

/** Employee edits their own directory-safe public profile fields. */
export async function updatePublicProfile(
  _prev: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { user, organization } = await requireWritableOrganizationContext();
    if (!user.profile) throw new Error("An employee profile is required.");

    const nickname = String(formData.get("nickname") ?? "").trim().slice(0, 80) || null;
    const pronouns = String(formData.get("pronouns") ?? "").trim().slice(0, 40) || null;
    const location = String(formData.get("location") ?? "").trim().slice(0, 120) || null;
    const linkedinUrl = normalizeLinkedIn(String(formData.get("linkedinUrl") ?? ""));

    // updateMany scoped by org so the write cannot touch a profile in another tenant.
    const result = await prisma.employee_profiles.updateMany({
      where: { id: user.profile.id, organization_id: organization.id },
      data: { nickname, pronouns, location, linkedin_url: linkedinUrl },
    });
    if (result.count !== 1) throw new Error("Profile not found in this organization.");

    revalidatePath("/profile");
    revalidatePath("/people");
    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save profile." };
  }
}

/** Employee uploads/replaces their own avatar. */
export async function uploadAvatar(
  _prev: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { user, organization } = await requireWritableOrganizationContext();
    if (!user.profile) throw new Error("An employee profile is required.");
    if (user.profile.organization_id && user.profile.organization_id !== organization.id) {
      throw new Error("Your profile does not belong to this organization.");
    }

    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
    validateAvatarUpload({ mimeType: file.type, sizeBytes: file.size });
    if (file.size > MAX_AVATAR_BYTES) throw new Error("The image exceeds the 1 MB limit.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const profileId = user.profile.id;
    await prisma.$transaction(async (tx) => {
      await saveAvatar({ profileId, mimeType: file.type, bytes }, tx);
      await tx.audit_history.create({
        data: {
          entity_type: "employee_profile",
          entity_id: profileId,
          action: "avatar_upload",
          actor_user_id: user.id,
          organization_id: organization.id,
          metadata: { size_bytes: bytes.length, mime_type: file.type },
        },
      });
    });

    revalidatePath("/profile");
    revalidatePath("/people");
    return { ok: true, data: { updated: true } };
  } catch (e) {
    if (e instanceof AvatarValidationError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Could not upload avatar." };
  }
}

/** Employee submits a hardware/equipment request for themselves. */
export async function submitHardwareRequest(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, organization } = await requireWritableOrganizationContext();
    if (!user.profile) throw new Error("An employee profile is required to submit a request.");
    if (user.profile.organization_id && user.profile.organization_id !== organization.id) {
      throw new Error("Your profile does not belong to this organization.");
    }
    const organizationId = organization.id;

    const details = String(formData.get("details") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim() || null;

    if (details.length === 0) return { ok: false, error: "Describe what you need." };
    if (details.length > HARDWARE_REQUEST_MAX_LENGTH) {
      return { ok: false, error: `Keep the request under ${HARDWARE_REQUEST_MAX_LENGTH} characters.` };
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.hardware_requests.create({
        data: {
          employee_profile_id: user.profile!.id,
          organization_id: organizationId,
          details,
          category,
          status: "requested",
          created_by: user.id,
        },
        select: { id: true },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "hardware_request",
          entity_id: row.id,
          action: "request",
          actor_user_id: user.id,
          organization_id: organizationId,
          after_state: { status: "requested", details },
        },
      });
      return row;
    });

    revalidatePath("/profile");
    revalidatePath("/approvals");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not submit request." };
  }
}

/** Employee cancels their own still-pending hardware request. */
export async function cancelHardwareRequest(formData: FormData): Promise<void> {
  const { user, organization } = await requireWritableOrganizationContext();
  if (!user.profile) throw new Error("Employee profile required.");
  const organizationId = organization.id;
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) throw new Error("Request is required.");

  await prisma.$transaction(async (tx) => {
    const request = await tx.hardware_requests.findFirst({
      where: {
        id: requestId,
        employee_profile_id: user.profile!.id,
        organization_id: organizationId,
        status: "requested",
      },
      select: { id: true },
    });
    if (!request) throw new Error("Only your pending requests can be cancelled.");

    await tx.hardware_requests.update({ where: { id: request.id }, data: { status: "cancelled" } });
    await tx.audit_history.create({
      data: {
        entity_type: "hardware_request",
        entity_id: request.id,
        action: "cancel",
        actor_user_id: user.id,
        organization_id: organizationId,
        before_state: { status: "requested" },
        after_state: { status: "cancelled" },
      },
    });
  });

  revalidatePath("/profile");
  revalidatePath("/approvals");
}
