"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { getProjectDeletionBlockers } from "@/lib/admin/deletion";
import { updateProjectPayPeriod } from "@/lib/admin/project-pay-period-mutations";
import { prisma } from "@/lib/prisma";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback;
  if (e instanceof Error) return e.message;
  return fallback;
}

function normalizedName(raw: FormDataEntryValue | null): string {
  return z.string().min(2, "Project name is required.").parse(String(raw ?? "").trim());
}

async function assertNameAvailable(name: string, organizationId: string, excludeId?: string) {
  const existing = await prisma.projects.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      organization_id: organizationId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new Error("A project with that name already exists.");
}

export async function createProject(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();

    const name = normalizedName(formData.get("name"));
    const requiresPlatform = String(formData.get("requiresPlatform") ?? "") === "on";

    await assertNameAvailable(name, organization.id);

    const project = await prisma.projects.create({
      data: { name, requires_platform: requiresPlatform, is_active: true, organization_id: organization.id },
      select: { id: true },
    });

    revalidatePath("/admin/projects");
    revalidatePath("/admin");
    revalidatePath("/reports");

    return { ok: true, data: { id: project.id } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not create project.") };
  }
}

export async function updateProject(
  _prevState: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();

    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));
    const name = normalizedName(formData.get("name"));
    const requiresPlatform = String(formData.get("requiresPlatform") ?? "") === "on";
    const isActive = String(formData.get("isActive") ?? "") === "on";

    await assertNameAvailable(name, organization.id, id);

    const updated = await prisma.projects.updateMany({
      where: { id, organization_id: organization.id },
      data: { name, requires_platform: requiresPlatform, is_active: isActive },
    });
    if (updated.count !== 1) throw new Error("Project not found.");

    revalidatePath("/admin/projects");
    revalidatePath("/admin");
    revalidatePath("/reports");
    revalidatePath("/my-timesheet");

    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not save project.") };
  }
}

export async function saveProjectPayPeriod(
  _prevState: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    const { organization, user } = await requireWritableOrganizationAdmin();

    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));
    await updateProjectPayPeriod(organization.id, user.id, id, {
      mode: String(formData.get("mode") ?? "inherit"),
      cadence: formData.get("cadence") != null ? String(formData.get("cadence")) : undefined,
      startWeekday: formData.get("startWeekday") != null ? String(formData.get("startWeekday")) : undefined,
      anchor: formData.get("anchor") != null ? String(formData.get("anchor")) : undefined,
      splitDay: formData.get("splitDay") != null ? String(formData.get("splitDay")) : undefined,
      monthlyStartDay: formData.get("monthlyStartDay") != null ? String(formData.get("monthlyStartDay")) : undefined,
    });

    revalidatePath("/admin/projects");
    revalidatePath("/reports");

    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not save project pay period.") };
  }
}

export async function deleteProject(
  _prevState: ActionResult<{ deleted: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();

    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));

    const project = await prisma.projects.findFirst({
      where: { id, organization_id: organization.id },
      select: { id: true, name: true },
    });
    if (!project) throw new Error("Project not found.");

    const blockers = await getProjectDeletionBlockers(id);
    if (blockers.length > 0) {
      throw new Error(
        `This project has references (${blockers.join(", ")}) and cannot be deleted. Deactivate it instead.`,
      );
    }

    await prisma.projects.deleteMany({ where: { id, organization_id: organization.id } });

    revalidatePath("/admin/projects");
    revalidatePath("/admin");
    revalidatePath("/reports");

    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not delete project.") };
  }
}
