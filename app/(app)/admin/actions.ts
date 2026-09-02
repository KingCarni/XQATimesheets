"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  generateTemporaryPassword,
  hashPassword,
} from "@/lib/auth/password";
import { getUserDeletionBlockers } from "@/lib/admin/deletion";
import { prisma } from "@/lib/prisma";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const roleSchema = z.enum(["employee", "manager", "admin"]);
const assignmentRoleSchema = z.enum(["member", "lead", "manager"]);

function readAssignments(formData: FormData) {
  return formData
    .getAll("assignment")
    .map((value) => String(value).split(":"))
    .filter(
      ([projectId, role]) =>
        projectId && assignmentRoleSchema.safeParse(role).success,
    )
    .map(([project_id, assignment_role]) => ({
      project_id,
      assignment_role: assignmentRoleSchema.parse(assignment_role),
    }));
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? fallback;
  }

  if (e instanceof Error) {
    return e.message;
  }

  return fallback;
}

export type CreateEmployeeResult = {
  email: string;
  fullName: string;
  temporaryPassword: string;
};

export async function createEmployee(
  _prevState: ActionResult<CreateEmployeeResult> | null,
  formData: FormData,
): Promise<ActionResult<CreateEmployeeResult>> {
  try {
    await requireRole("admin");

    const email = z
      .string()
      .email()
      .parse(
        String(formData.get("email") ?? "")
          .trim()
          .toLowerCase(),
      );

    const fullName = z
      .string()
      .min(2, "Full name is required.")
      .parse(String(formData.get("fullName") ?? "").trim());

    const role = roleSchema.parse(
      String(formData.get("role") ?? "employee"),
    );

    const timezone = z
      .string()
      .min(1)
      .parse(
        String(
          formData.get("timezone") ?? "America/Vancouver",
        ),
      );

    const assignments = readAssignments(formData);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.users.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing) {
        throw new Error("A user with that email already exists.");
      }

      const user = await tx.users.create({
        data: {
          email,
          role,
          is_active: true,
          password_hash: passwordHash,
        },
      });

      const profile = await tx.employee_profiles.create({
        data: {
          user_id: user.id,
          full_name: fullName,
          employee_code:
            String(formData.get("employeeCode") ?? "").trim() || null,
          department:
            String(formData.get("department") ?? "").trim() || null,
          timezone,
          can_approve: role === "manager" || role === "admin",
        },
      });

      if (assignments.length > 0) {
        await tx.project_assignments.createMany({
          data: assignments.map((assignment) => ({
            employee_profile_id: profile.id,
            ...assignment,
          })),
        });
      }
    });

    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        email,
        fullName,
        temporaryPassword,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, "Could not create employee."),
    };
  }
}

export async function updateEmployee(
  _prevState: ActionResult<{ updated: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ updated: true }>> {
  try {
    await requireRole("admin");

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    const role = roleSchema.parse(
      String(formData.get("role") ?? "employee"),
    );

    const assignments = readAssignments(formData);

    await prisma.$transaction(async (tx) => {
      const user = await tx.users.update({
        where: { id: userId },
        data: {
          role,
          is_active:
            String(formData.get("isActive") ?? "") === "on",
        },
        include: {
          employee_profile: true,
        },
      });

      if (!user.employee_profile) {
        throw new Error("Employee profile not found.");
      }

      await tx.employee_profiles.update({
        where: {
          id: user.employee_profile.id,
        },
        data: {
          full_name: z
            .string()
            .min(2, "Full name is required.")
            .parse(
              String(formData.get("fullName") ?? "").trim(),
            ),
          employee_code:
            String(formData.get("employeeCode") ?? "").trim() || null,
          department:
            String(formData.get("department") ?? "").trim() || null,
          timezone: z
            .string()
            .min(1)
            .parse(
              String(
                formData.get("timezone") ?? "America/Vancouver",
              ),
            ),
          can_approve: role === "manager" || role === "admin",
        },
      });

      await tx.project_assignments.updateMany({
        where: {
          employee_profile_id: user.employee_profile.id,
        },
        data: {
          is_active: false,
        },
      });

      for (const assignment of assignments) {
        await tx.project_assignments.upsert({
          where: {
            employee_profile_id_project_id: {
              employee_profile_id: user.employee_profile.id,
              project_id: assignment.project_id,
            },
          },
          create: {
            employee_profile_id: user.employee_profile.id,
            project_id: assignment.project_id,
            assignment_role: assignment.assignment_role,
            is_active: true,
          },
          update: {
            assignment_role: assignment.assignment_role,
            is_active: true,
          },
        });
      }
    });

    revalidatePath("/admin");
    revalidatePath("/team");
    revalidatePath("/approvals");

    return {
      ok: true,
      data: {
        updated: true,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, "Could not save employee."),
    };
  }
}

export async function deleteEmployee(
  _prevState: ActionResult<{ deleted: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ deleted: true }>> {
  try {
    const admin = await requireRole("admin");

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    if (userId === admin.id) {
      throw new Error("You cannot delete your own account.");
    }

    const target = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, employee_profile: { select: { id: true } } },
    });
    if (!target) {
      throw new Error("Employee not found.");
    }

    const blockers = await getUserDeletionBlockers(target);
    if (blockers.length > 0) {
      throw new Error(
        "This employee has historical records and cannot be deleted. Deactivate them instead.",
      );
    }

    await prisma.$transaction(async (tx) => {
      // Detach any employee_profiles still pointing at this user as their
      // manager — a config pointer, not historical data, so it's safe to
      // clear rather than block the delete on.
      await tx.employee_profiles.updateMany({
        where: { manager_user_id: userId },
        data: { manager_user_id: null },
      });

      // Deleting the user cascades their own employee_profile (if any) and,
      // in turn, its project_assignments/entry_templates/pto_balances —
      // all non-historical — via the schema's onDelete: Cascade. Every
      // historical table was already verified empty above, so nothing of
      // record is lost.
      await tx.users.delete({ where: { id: userId } });
    });

    revalidatePath("/admin");
    revalidatePath("/team");
    revalidatePath("/approvals");

    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, "Could not delete employee."),
    };
  }
}

export type ResetPasswordResult = {
  temporaryPassword: string;
};

export async function resetEmployeePassword(
  _prevState: ActionResult<ResetPasswordResult> | null,
  formData: FormData,
): Promise<ActionResult<ResetPasswordResult>> {
  try {
    await requireRole("admin");

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await prisma.users.update({
      where: {
        id: userId,
      },
      data: {
        password_hash: passwordHash,
      },
    });

    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        temporaryPassword,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: errorMessage(e, "Could not reset password."),
    };
  }
}
