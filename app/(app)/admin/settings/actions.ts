"use server";

import { revalidatePath } from "next/cache";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { updatePayPeriodSettings } from "@/lib/organizations/pay-period-settings";
import { prisma } from "@/lib/prisma";
import { isCutoffPolicyReady } from "@/lib/pay-periods/cutoff";

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

/**
 * MHV-4 submission cutoff policy. Admin-only. Validates offset (0..14) and
 * HH:MM before persisting; when enabled, both fields must be present. Audits
 * the change so operational history is preserved.
 */
export async function saveSubmissionCutoffSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { organization, user } = await requireWritableOrganizationAdmin();

  const enabled = formData.get("enabled") === "on";
  const rawOffset = formData.get("offsetDays");
  const rawTime = String(formData.get("timeLocal") ?? "").trim();

  const offsetDays =
    rawOffset === null || String(rawOffset).trim() === "" ? null : Number(rawOffset);
  const timeLocal = rawTime === "" ? null : rawTime;

  const policy = { enabled, offsetDays, timeLocal };
  if (enabled && !isCutoffPolicyReady(policy)) {
    return {
      error: "When enabled, offset must be 0–14 days and time must be a valid HH:MM.",
      ok: false,
    };
  }

  const before = await prisma.organizations.findUnique({
    where: { id: organization.id },
    select: {
      submission_cutoff_enabled: true,
      submission_cutoff_offset_days: true,
      submission_cutoff_time: true,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.organizations.update({
        where: { id: organization.id },
        data: {
          submission_cutoff_enabled: enabled,
          submission_cutoff_offset_days: enabled ? offsetDays : null,
          submission_cutoff_time: enabled ? timeLocal : null,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "organization",
          entity_id: organization.id,
          action: "update_submission_cutoff",
          actor_user_id: user.id,
          before_state: before ?? undefined,
          after_state: {
            submission_cutoff_enabled: enabled,
            submission_cutoff_offset_days: enabled ? offsetDays : null,
            submission_cutoff_time: enabled ? timeLocal : null,
          },
          organization_id: organization.id,
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save cutoff settings.", ok: false };
  }

  revalidatePath("/admin/settings");
  return { error: null, ok: true };
}
