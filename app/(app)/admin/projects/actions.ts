"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { getProjectDeletionBlockers } from "@/lib/admin/deletion";
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

async function assertNameAvailable(name: string, excludeId?: string) {
  const existing = await prisma.projects.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new Error("A project with that name already exists.");
}

export async function createProject(
  _prevState: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole("admin");

    const name = normalizedName(formData.get("name"));
    const requiresPlatform = String(formData.get("requiresPlatform") ?? "") === "on";

    await assertNameAvailable(name);

    const project = await prisma.projects.create({
      data: { name, requires_platform: requiresPlatform, is_active: true },
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
    await requireRole("admin");

    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));
    const name = normalizedName(formData.get("name"));
    const requiresPlatform = String(formData.get("requiresPlatform") ?? "") === "on";
    const isActive = String(formData.get("isActive") ?? "") === "on";

    await assertNameAvailable(name, id);

    await prisma.projects.update({
      where: { id },
      data: { name, requires_platform: requiresPlatform, is_active: isActive },
    });

    revalidatePath("/admin/projects");
    revalidatePath("/admin");
    revalidatePath("/reports");
    revalidatePath("/my-timesheet");

    return { ok: true, data: { updated: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not save project.") };
  }
}

export async function deleteProject(
  _prevState: ActionResult<{ deleted: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  try {
    await requireRole("admin");

    const id = z.string().uuid().parse(String(formData.get("id") ?? ""));

    const project = await prisma.projects.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!project) throw new Error("Project not found.");

    const blockers = await getProjectDeletionBlockers(id);
    if (blockers.length > 0) {
      throw new Error(
        `This project has references (${blockers.join(", ")}) and cannot be deleted. Deactivate it instead.`,
      );
    }

    await prisma.projects.delete({ where: { id } });

    revalidatePath("/admin/projects");
    revalidatePath("/admin");
    revalidatePath("/reports");

    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Could not delete project.") };
  }
}
