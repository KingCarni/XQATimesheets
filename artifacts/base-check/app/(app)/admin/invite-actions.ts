"use server";

import { revalidatePath } from "next/cache";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { buildAcceptInviteUrl } from "@/lib/tenant/urls";
import { createInvitation, revokeInvitation } from "@/lib/invitations/queries";
import { APP_ROLES, type AppRole } from "@/types/domain";

export type InviteState =
  | { ok: true; email: string; link: string }
  | { ok: false; error: string }
  | null;

/** Admin: create an invitation and return a copy-able accept link. */
export async function createInviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const { organization, user } = await requireWritableOrganizationAdmin();
    const email = String(formData.get("email") ?? "");
    const roleRaw = String(formData.get("role") ?? "employee");
    const role: AppRole = (APP_ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as AppRole) : "employee";

    const invite = await createInvitation({ organizationId: organization.id, email, role, createdBy: user.id });
    const link = await buildAcceptInviteUrl(invite.token);

    revalidatePath("/admin");
    return { ok: true, email: invite.email, link };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send invitation." };
  }
}

/** Admin: revoke a pending invitation. */
export async function revokeInviteAction(formData: FormData): Promise<void> {
  const { organization, user } = await requireWritableOrganizationAdmin();
  const id = String(formData.get("id") ?? "");
  await revokeInvitation(organization.id, id, user.id);
  revalidatePath("/admin");
}
