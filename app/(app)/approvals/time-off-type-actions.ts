"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error) return e.message;
  return fallback;
}

/**
 * Time-off types are modelled as `activity_types` with `is_pto = true` (the
 * existing catalog concept — no duplicate model). Admins can add, rename,
 * recategorize, and activate/deactivate them. Types are never hard-deleted so
 * historical PTO requests keep a valid reference; deactivation hides a type
 * from new requests instead.
 */
export async function createTimeOffType(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const name = z.string().min(2, "Name is required.").parse(String(formData.get("name") ?? "").trim());
    const category = String(formData.get("category") ?? "").trim() || "pto";

    const existing = await prisma.activity_types.findFirst({
      where: { name, organization_id: orgId },
      select: { id: true },
    });
    if (existing) throw new Error("A work/time-off type with that name already exists.");

    const created = await prisma.activity_types.create({
      data: { name, category, is_pto: true, is_billable: false, is_active: true, organization_id: orgId },
      select: { id: true },
    });

    await prisma.audit_history.create({
      data: {
        entity_type: "activity_type",
        entity_id: created.id,
        action: "create",
        organization_id: orgId,
        metadata: { name, is_pto: true },
      },
    });

    revalidatePath("/approvals");
    revalidatePath("/profile");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not create time-off type.") };
  }
}

export async function updateTimeOffType(
  _prev: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));
    const name = z.string().min(2, "Name is required.").parse(String(formData.get("name") ?? "").trim());
    const isActive = String(formData.get("isActive") ?? "") === "on";
    const category = String(formData.get("category") ?? "").trim() || null;

    const current = await prisma.activity_types.findFirst({ where: { id, organization_id: orgId } });
    if (!current) throw new Error("Time-off type not found.");
    if (!current.is_pto) throw new Error("Only time-off types can be edited here.");

    // Guard the per-org unique name constraint with a friendly message.
    if (name !== current.name) {
      const clash = await prisma.activity_types.findFirst({
        where: { name, organization_id: orgId },
        select: { id: true },
      });
      if (clash) throw new Error("Another type already uses that name.");
    }

    await prisma.activity_types.updateMany({
      where: { id, organization_id: orgId },
      data: { name, is_active: isActive, ...(category ? { category } : {}) },
    });

    await prisma.audit_history.create({
      data: {
        entity_type: "activity_type",
        entity_id: id,
        action: "update",
        organization_id: orgId,
        before_state: { name: current.name, is_active: current.is_active },
        after_state: { name, is_active: isActive },
      },
    });

    revalidatePath("/approvals");
    revalidatePath("/profile");
    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not update time-off type.") };
  }
}
