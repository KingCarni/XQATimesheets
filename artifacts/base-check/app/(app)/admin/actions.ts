"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import {
  generateTemporaryPassword,
  hashPassword,
} from "@/lib/auth/password";
import { getUserDeletionBlockers } from "@/lib/admin/deletion";
import { provisionEmployee } from "@/lib/admin/provision";
import { prisma } from "@/lib/prisma";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const roleSchema = z.enum(["employee", "manager", "admin"]);
const assignmentRoleSchema = z.enum(["member", "lead", "manager"]);

/** Ensure the target user is a member of this org before any admin mutation. */
async function assertOrgMember(organizationId: string, userId: string) {
  const membership = await prisma.organization_members.findUnique({
    where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("Employee not found in this organization.");
}

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
    const { organization } = await requireWritableOrganizationAdmin();

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

    const result = await prisma.$transaction((tx) =>
      provisionEmployee(tx, {
        organizationId: organization.id,
        email,
        fullName,
        role,
        employeeCode: String(formData.get("employeeCode") ?? "").trim() || null,
        department: String(formData.get("department") ?? "").trim() || null,
        timezone,
        assignments,
      }),
    );

    revalidatePath("/admin");

    return {
      ok: true,
      data: {
        email: result.email,
        fullName: result.fullName,
        temporaryPassword: result.temporaryPassword,
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
    const { organization } = await requireWritableOrganizationAdmin();

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    const role = roleSchema.parse(
      String(formData.get("role") ?? "employee"),
    );

    const assignments = readAssignments(formData);

    await assertOrgMember(organization.id, userId);

    await prisma.$transaction(async (tx) => {
      const isActive = String(formData.get("isActive") ?? "") === "on";

      // Role/active for THIS organization live on the membership (authoritative);
      // the global user.role is kept in sync during the single-org transition.
      await tx.organization_members.update({
        where: { organization_id_user_id: { organization_id: organization.id, user_id: userId } },
        data: { role, is_active: isActive },
      });

      const user = await tx.users.update({
        where: { id: userId },
        data: { role, is_active: isActive },
        include: { employee_profile: true },
      });

      if (!user.employee_profile || user.employee_profile.organization_id !== organization.id) {
        throw new Error("Employee profile not found in this organization.");
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
          organization_id: organization.id,
        },
        data: {
          is_active: false,
        },
      });

      // Only projects that belong to this organization may be assigned.
      const validProjectIds = new Set(
        (
          await tx.projects.findMany({
            where: { id: { in: assignments.map((a) => a.project_id) }, organization_id: organization.id },
            select: { id: true },
          })
        ).map((p) => p.id),
      );

      for (const assignment of assignments) {
        if (!validProjectIds.has(assignment.project_id)) continue;
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
            organization_id: organization.id,
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
    const { user: admin, organization } = await requireWritableOrganizationAdmin();

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    if (userId === admin.id) {
      throw new Error("You cannot delete your own account.");
    }

    await assertOrgMember(organization.id, userId);

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
    const { organization } = await requireWritableOrganizationAdmin();

    const userId = z
      .string()
      .uuid()
      .parse(String(formData.get("userId") ?? ""));

    await assertOrgMember(organization.id, userId);

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
