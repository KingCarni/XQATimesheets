"use server";

import { revalidatePath } from "next/cache";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { updatePayPeriodSettings } from "@/lib/organizations/pay-period-settings";

export type SettingsState = { error: string | null; ok: boolean };

/**
 * Save the organization's payroll-period configuration. Admin-only and blocked
 * on read-only demo workspaces (both enforced server-side by
 * `requireWritableOrganizationAdmin`). All writes are org-scoped.
 */
export async function savePayPeriodSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { organization, user } = await requireWritableOrganizationAdmin();

  try {
    await updatePayPeriodSettings(organization.id, user.id, {
      cadence: String(formData.get("cadence") ?? ""),
      startWeekday: formData.get("startWeekday") != null ? String(formData.get("startWeekday")) : undefined,
      anchor: formData.get("anchor") != null ? String(formData.get("anchor")) : undefined,
      splitDay: formData.get("splitDay") != null ? String(formData.get("splitDay")) : undefined,
      monthlyStartDay:
        formData.get("monthlyStartDay") != null ? String(formData.get("monthlyStartDay")) : undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save pay-period settings.", ok: false };
  }

  revalidatePath("/admin/settings");
  return { error: null, ok: true };
}
