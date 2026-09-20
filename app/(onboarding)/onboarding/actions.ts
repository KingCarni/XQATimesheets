"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { buildAcceptInviteUrl } from "@/lib/tenant/urls";
import { createInvitation, revokeInvitation } from "@/lib/invitations/queries";
import {
  completeOnboarding,
  saveBranding,
  saveCompanyDetails,
  setOnboardingStep,
} from "@/lib/onboarding/mutations";
import { APP_ROLES, type AppRole } from "@/types/domain";

export type SimpleState = { error: string | null };

const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB

/** Step 1 → 2: save company details, advance to branding. */
export async function saveCompanyStep(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const { organization } = await requireWritableOrganizationAdmin();

  try {
    await saveCompanyDetails(organization.id, {
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
    await setOnboardingStep(organization.id, "branding");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save company details." };
  }
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/** Step 2 → 3: save branding (colours + optional logo), advance to projects. */
export async function saveBrandingStep(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const { organization } = await requireWritableOrganizationAdmin();

  let logo: { mime: string; bytes: Uint8Array<ArrayBuffer> } | null = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!LOGO_MIME.has(file.type)) return { error: "Logo must be a PNG, JPEG, WebP, or SVG image." };
    if (file.size > MAX_LOGO_BYTES) return { error: "Logo must be 1 MB or smaller." };
    logo = { mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  try {
    await saveBranding(organization.id, {
      primaryColor: String(formData.get("primaryColor") ?? ""),
      accentColor: String(formData.get("accentColor") ?? ""),
      logo,
    });
    await setOnboardingStep(organization.id, "projects");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save branding." };
  }
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/** Step 3 → 4: advance from projects to team. */
export async function continueToTeamStep(): Promise<void> {
  const { organization } = await requireWritableOrganizationAdmin();
  await setOnboardingStep(organization.id, "team");
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/** Step 4 → 5: advance from team to finish. */
export async function continueToFinishStep(): Promise<void> {
  const { organization } = await requireWritableOrganizationAdmin();
  await setOnboardingStep(organization.id, "finish");
  revalidatePath("/onboarding");
  redirect("/onboarding");
}

export type InviteState =
  | { ok: true; email: string; link: string }
  | { ok: false; error: string }
  | null;

/** Create an invitation and return a copy-able accept link (no email provider). */
export async function inviteMemberAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const { organization, user } = await requireWritableOrganizationAdmin();
    const email = String(formData.get("email") ?? "");
    const roleRaw = String(formData.get("role") ?? "employee");
    const role: AppRole = (APP_ROLES as readonly string[]).includes(roleRaw) ? (roleRaw as AppRole) : "employee";

    const invite = await createInvitation({ organizationId: organization.id, email, role, createdBy: user.id });
    const link = await buildAcceptInviteUrl(invite.token);

    revalidatePath("/onboarding");
    return { ok: true, email: invite.email, link };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send invitation." };
  }
}

/** Revoke a pending invitation. */
export async function revokeInviteAction(formData: FormData): Promise<void> {
  const { organization, user } = await requireWritableOrganizationAdmin();
  const id = String(formData.get("id") ?? "");
  await revokeInvitation(organization.id, id, user.id);
  revalidatePath("/onboarding");
}

/** Step 5: mark onboarding complete and enter the workspace. */
export async function finishOnboardingAction(): Promise<void> {
  const { organization, user } = await requireWritableOrganizationAdmin();
  await completeOnboarding(organization.id, user.id);
  redirect("/my-timesheet");
}
