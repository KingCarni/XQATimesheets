import "server-only";

import type { Prisma } from "@prisma/client";

import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import type { AppRole, AssignmentRole } from "@/types/domain";

export type ProvisionInput = {
  organizationId: string;
  email: string;
  fullName: string;
  role?: AppRole;
  department?: string | null;
  employeeCode?: string | null;
  timezone?: string;
  assignments?: { project_id: string; assignment_role: AssignmentRole }[];
};

export type ProvisionResult = { userId: string; email: string; fullName: string; temporaryPassword: string };

type Client = Prisma.TransactionClient;

/**
 * Single source of truth for creating an employee account: generates a secure
 * temporary password (hashed, never stored in plaintext), creates the user +
 * employee profile, and adds project assignments. Shared by the admin "Add
 * Employee" form and the Excel import so there is exactly one account-creation
 * pathway. Must be called inside a transaction (`tx`). Throws if the email is
 * already taken — callers must never overwrite an existing account.
 */
export async function provisionEmployee(tx: Client, input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const role: AppRole = input.role ?? "employee";

  const existing = await tx.users.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error("A user with that email already exists.");

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await tx.users.create({
    data: { email, role, is_active: true, password_hash: passwordHash },
  });

  // Tenant membership is the authoritative access grant for this organization.
  await tx.organization_members.create({
    data: { organization_id: input.organizationId, user_id: user.id, role, is_active: true },
  });

  const profile = await tx.employee_profiles.create({
    data: {
      user_id: user.id,
      organization_id: input.organizationId,
      full_name: fullName,
      employee_code: input.employeeCode?.trim() || null,
      department: input.department?.trim() || null,
      timezone: input.timezone?.trim() || "America/Vancouver",
      can_approve: role === "manager" || role === "admin",
    },
  });

  const assignments = input.assignments ?? [];
  if (assignments.length > 0) {
    await tx.project_assignments.createMany({
      data: assignments.map((a) => ({
        employee_profile_id: profile.id,
        organization_id: input.organizationId,
        project_id: a.project_id,
        assignment_role: a.assignment_role,
      })),
    });
  }

  return { userId: user.id, email, fullName, temporaryPassword };
}
