"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import {
  AttachmentValidationError,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
  validateAttachmentUpload,
} from "@/lib/storage/contract-attachments";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error) return e.message;
  return fallback;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
function optionalDate(value: FormDataEntryValue | null): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return toDate(dateStr.parse(text));
}

/* ------------------------------- Contracts ------------------------------- */

const contractStatusSchema = z.enum(["upcoming", "active", "expired", "terminated"]);

export async function createContract(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const profileId = z.string().uuid().parse(String(formData.get("employeeProfileId") ?? ""));
    const title = z.string().min(2, "Contract title is required.").parse(String(formData.get("title") ?? "").trim());
    const contractType = String(formData.get("contractType") ?? "").trim() || null;
    const startDate = toDate(dateStr.parse(String(formData.get("startDate") ?? "")));
    const endDate = optionalDate(formData.get("endDate"));
    const status = contractStatusSchema.parse(String(formData.get("status") ?? "active"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (endDate && endDate < startDate) throw new Error("End date must be on or after the start date.");

    const profile = await prisma.employee_profiles.findFirst({
      where: { id: profileId, organization_id: orgId },
      select: { id: true },
    });
    if (!profile) throw new Error("Employee not found.");

    const created = await prisma.$transaction(async (tx) => {
      const contract = await tx.employee_contracts.create({
        data: {
          employee_profile_id: profileId,
          organization_id: orgId,
          title,
          contract_type: contractType,
          start_date: startDate,
          end_date: endDate,
          status,
          notes,
          created_by: admin.id,
        },
        select: { id: true },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "employee_contract",
          entity_id: contract.id,
          action: "create",
          actor_user_id: admin.id,
          organization_id: orgId,
          metadata: { employee_profile_id: profileId, title, status },
        },
      });
      return contract;
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not create contract.") };
  }
}

export async function updateContract(
  _prev: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const id = z.string().uuid().parse(String(formData.get("contractId") ?? ""));
    const title = z.string().min(2, "Contract title is required.").parse(String(formData.get("title") ?? "").trim());
    const contractType = String(formData.get("contractType") ?? "").trim() || null;
    const startDate = toDate(dateStr.parse(String(formData.get("startDate") ?? "")));
    const endDate = optionalDate(formData.get("endDate"));
    const status = contractStatusSchema.parse(String(formData.get("status") ?? "active"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (endDate && endDate < startDate) throw new Error("End date must be on or after the start date.");

    const existing = await prisma.employee_contracts.findFirst({
      where: { id, organization_id: orgId },
      select: { status: true },
    });
    if (!existing) throw new Error("Contract not found.");

    await prisma.$transaction(async (tx) => {
      await tx.employee_contracts.updateMany({
        where: { id, organization_id: orgId },
        data: {
          title,
          contract_type: contractType,
          start_date: startDate,
          end_date: endDate,
          status,
          notes,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "employee_contract",
          entity_id: id,
          action: "update",
          actor_user_id: admin.id,
          organization_id: orgId,
          before_state: { status: existing.status },
          after_state: { status },
        },
      });
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not update contract.") };
  }
}

/**
 * Upload a new attachment to an existing contract. Previous attachments are
 * retained (history is never overwritten) — this simply adds a newer version.
 * MIME type and size are validated server-side, twice: once cheaply here and
 * again inside `saveAttachment`.
 */
export async function uploadContractAttachment(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const contractId = z.string().uuid().parse(String(formData.get("contractId") ?? ""));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF file to upload.");

    validateAttachmentUpload({ mimeType: file.type, sizeBytes: file.size });
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("The file exceeds the 5 MB limit.");

    const contract = await prisma.employee_contracts.findFirst({
      where: { id: contractId, organization_id: orgId },
      select: { id: true },
    });
    if (!contract) throw new Error("Contract not found.");

    const bytes = new Uint8Array(await file.arrayBuffer());

    const saved = await prisma.$transaction(async (tx) => {
      const attachment = await saveAttachment(
        {
          contractId,
          organizationId: orgId,
          originalFilename: file.name || "contract.pdf",
          mimeType: file.type,
          bytes,
          uploadedByUserId: admin.id,
        },
        tx,
      );
      await tx.audit_history.create({
        data: {
          entity_type: "contract_attachment",
          entity_id: attachment.id,
          action: "upload",
          actor_user_id: admin.id,
          organization_id: orgId,
          metadata: { contract_id: contractId, filename: attachment.originalFilename, size_bytes: attachment.sizeBytes },
        },
      });
      return attachment;
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    if (e instanceof AttachmentValidationError) return { ok: false, error: e.message };
    return { ok: false, error: errorMessage(e, "Could not upload attachment.") };
  }
}

/* ------------------------------- Equipment ------------------------------- */

const equipmentStatusSchema = z.enum(["assigned", "returned", "retired"]);

export async function createEquipment(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const profileId = z.string().uuid().parse(String(formData.get("employeeProfileId") ?? ""));
    const name = z.string().min(1, "Equipment name is required.").parse(String(formData.get("name") ?? "").trim());
    const assetTag = String(formData.get("assetTag") ?? "").trim() || null;
    const issuedOn = optionalDate(formData.get("issuedOn"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const profile = await prisma.employee_profiles.findFirst({
      where: { id: profileId, organization_id: orgId },
      select: { id: true },
    });
    if (!profile) throw new Error("Employee not found.");

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.equipment_assignments.create({
        data: {
          employee_profile_id: profileId,
          organization_id: orgId,
          name,
          asset_tag: assetTag,
          issued_on: issuedOn,
          notes,
          status: "assigned",
          created_by: admin.id,
        },
        select: { id: true },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "equipment_assignment",
          entity_id: row.id,
          action: "create",
          actor_user_id: admin.id,
          organization_id: orgId,
          metadata: { employee_profile_id: profileId, name },
        },
      });
      return row;
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not add equipment.") };
  }
}

export async function updateEquipment(
  _prev: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const id = z.string().uuid().parse(String(formData.get("equipmentId") ?? ""));
    const name = z.string().min(1, "Equipment name is required.").parse(String(formData.get("name") ?? "").trim());
    const assetTag = String(formData.get("assetTag") ?? "").trim() || null;
    const status = equipmentStatusSchema.parse(String(formData.get("status") ?? "assigned"));
    const issuedOn = optionalDate(formData.get("issuedOn"));
    const returnedOn = optionalDate(formData.get("returnedOn"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const existing = await prisma.equipment_assignments.findFirst({
      where: { id, organization_id: orgId },
      select: { status: true },
    });
    if (!existing) throw new Error("Equipment record not found.");

    await prisma.$transaction(async (tx) => {
      await tx.equipment_assignments.updateMany({
        where: { id, organization_id: orgId },
        data: {
          name,
          asset_tag: assetTag,
          status,
          issued_on: issuedOn,
          // Stamp a return date automatically when marking returned without one.
          returned_on: status === "returned" && !returnedOn ? new Date() : returnedOn,
          notes,
        },
      });
      await tx.audit_history.create({
        data: {
          entity_type: "equipment_assignment",
          entity_id: id,
          action: "update",
          actor_user_id: admin.id,
          organization_id: orgId,
          before_state: { status: existing.status },
          after_state: { status },
        },
      });
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not update equipment.") };
  }
}

/* --------------------------- Leave entitlements -------------------------- */

/**
 * Upsert (or clear) an admin-managed leave entitlement for an employee + leave
 * type. An empty hours value clears the entitlement. This is a flat number,
 * not an accrual — see lib/leave/entitlements.ts.
 */
export async function setLeaveEntitlement(
  _prev: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();
    const orgId = organization.id;
    const profileId = z.string().uuid().parse(String(formData.get("employeeProfileId") ?? ""));
    const activityTypeId = z.string().uuid().parse(String(formData.get("activityTypeId") ?? ""));
    const rawHours = String(formData.get("hours") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim() || null;

    // Both the employee and the leave type must belong to this organization.
    const [profile, activityType] = await Promise.all([
      prisma.employee_profiles.findFirst({ where: { id: profileId, organization_id: orgId }, select: { id: true } }),
      prisma.activity_types.findFirst({
        where: { id: activityTypeId, is_pto: true, organization_id: orgId },
        select: { id: true },
      }),
    ]);
    if (!profile) throw new Error("Employee not found.");
    if (!activityType) throw new Error("Choose a valid time-off type.");

    if (rawHours === "") {
      await prisma.leave_entitlements.deleteMany({
        where: { employee_profile_id: profileId, activity_type_id: activityTypeId, organization_id: orgId },
      });
      revalidatePath("/admin");
      revalidatePath("/profile");
      return { ok: true, data: { saved: true } };
    }

    const hours = z.coerce.number().min(0, "Hours can't be negative.").max(100000).parse(rawHours);

    await prisma.leave_entitlements.upsert({
      where: {
        employee_profile_id_activity_type_id: {
          employee_profile_id: profileId,
          activity_type_id: activityTypeId,
        },
      },
      create: {
        employee_profile_id: profileId,
        activity_type_id: activityTypeId,
        organization_id: orgId,
        hours,
        note,
        created_by: admin.id,
      },
      update: { hours, note },
    });

    revalidatePath("/admin");
    revalidatePath("/profile");
    return { ok: true, data: { saved: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not save entitlement.") };
  }
}
