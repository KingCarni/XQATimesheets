import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * MHV-3 recipient resolution — pure DB shim. Reuses the same authorization
 * model as MHV-2/9: an admin sees everything in the tenant; a manager only
 * sees projects where they hold `lead` or `manager` on an active project
 * assignment. General/legacy (no project) is admin-only.
 *
 * IMPORTANT: never notify a user for events they cannot review. This function
 * mirrors the read-side auth so that reminders can never leak an unrelated
 * project's activity.
 */

/**
 * Reviewer user ids for a specific project within an organization. Includes:
 *   - every active admin member of the organization
 *   - every user with an active project_assignment of lead/manager on THAT project
 * The submitting employee is excluded via `excludeUserId` (self-notifications
 * are noise for submissions).
 */
export async function reviewerUserIdsForProject(
  organizationId: string,
  projectId: string,
  excludeUserId?: string,
  tx?: Prisma.TransactionClient,
): Promise<string[]> {
  const client = tx ?? prisma;
  const [admins, projectManagers] = await Promise.all([
    client.organization_members.findMany({
      where: { organization_id: organizationId, role: "admin", is_active: true },
      select: { user_id: true },
    }),
    client.project_assignments.findMany({
      where: {
        organization_id: organizationId,
        project_id: projectId,
        is_active: true,
        assignment_role: { in: ["lead", "manager"] },
      },
      select: { employee_profile: { select: { user_id: true } } },
    }),
  ]);

  const ids = new Set<string>();
  for (const a of admins) ids.add(a.user_id);
  for (const m of projectManagers) if (m.employee_profile) ids.add(m.employee_profile.user_id);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

/**
 * Admin user ids for General / legacy weekly events (no project scope).
 * Managers never see General.
 */
export async function adminUserIds(
  organizationId: string,
  excludeUserId?: string,
  tx?: Prisma.TransactionClient,
): Promise<string[]> {
  const client = tx ?? prisma;
  const admins = await client.organization_members.findMany({
    where: { organization_id: organizationId, role: "admin", is_active: true },
    select: { user_id: true },
  });
  const ids = new Set(admins.map((a) => a.user_id));
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

/** Owning user id for an employee profile — used for approval/rejection back-notifications. */
export async function ownerUserId(
  employeeProfileId: string,
  organizationId: string,
  tx?: Prisma.TransactionClient,
): Promise<string | null> {
  const client = tx ?? prisma;
  const profile = await client.employee_profiles.findFirst({
    where: { id: employeeProfileId, organization_id: organizationId },
    select: { user_id: true },
  });
  return profile?.user_id ?? null;
}
