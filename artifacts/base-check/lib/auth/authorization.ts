import "server-only";

import { prisma } from "@/lib/prisma";
import { isPeriodEditable, type AppRole } from "@/types/domain";
import type { CurrentUser } from "./session";

/**
 * Authorization helpers. Every function that touches organization-owned data
 * takes an explicit `organizationId` and scopes its queries to it, so a viewer
 * can only ever see/act within the current tenant. Project-scoped manager
 * rules are additionally applied within that organization.
 *
 * NOTE: `viewer.role` passed here is the viewer's MEMBERSHIP role in the
 * current organization (constructed by the tenant context), not a global role.
 */
export function isAdmin(role: AppRole): boolean {
  return role === "admin";
}

export function isReviewerRole(role: AppRole): boolean {
  return role === "manager" || role === "admin";
}

export async function canReviewProfile(
  viewer: { id: string; role: AppRole; profile: { id: string } | null },
  profileId: string,
  organizationId: string,
): Promise<boolean> {
  if (isAdmin(viewer.role)) return true;
  if (!viewer.profile) return false;

  const managedAssignment = await prisma.project_assignments.findFirst({
    where: {
      employee_profile_id: viewer.profile.id,
      organization_id: organizationId,
      assignment_role: { in: ["manager", "lead"] },
      is_active: true,
      project: {
        organization_id: organizationId,
        project_assignments: {
          some: {
            employee_profile_id: profileId,
            organization_id: organizationId,
            is_active: true,
          },
        },
      },
    },
    select: { id: true },
  });

  return Boolean(managedAssignment);
}

export async function canViewProfile(
  viewer: { id: string; role: AppRole; profile: { id: string } | null },
  profileId: string,
  organizationId: string,
): Promise<boolean> {
  if (viewer.profile?.id === profileId) return true;
  if (await canReviewProfile(viewer, profileId, organizationId)) return true;

  const directReport = await prisma.employee_profiles.findFirst({
    where: { id: profileId, organization_id: organizationId, manager_user_id: viewer.id },
    select: { id: true },
  });

  return Boolean(directReport);
}

/** A `where` fragment for employee_profiles the viewer may review in this org. */
export function reviewableProfileWhere(viewer: CurrentUser, organizationId: string) {
  if (isAdmin(viewer.role)) return { organization_id: organizationId };
  if (!viewer.profile) return { id: "__none__" };

  return {
    organization_id: organizationId,
    project_assignments: {
      some: {
        is_active: true,
        organization_id: organizationId,
        project: {
          organization_id: organizationId,
          project_assignments: {
            some: {
              employee_profile_id: viewer.profile.id,
              organization_id: organizationId,
              is_active: true,
              assignment_role: { in: ["lead", "manager"] as const },
            },
          },
        },
      },
    },
  };
}

/**
 * Profile ids the viewer may review within the organization.
 * Returns `null` for an org admin (meaning "all profiles in this org"), or an
 * explicit id list for a project-scoped manager. Callers treat `null` as
 * "no per-profile filter" but MUST still apply `organization_id`.
 */
export async function getReviewableProfileIds(
  viewer: CurrentUser,
  organizationId: string,
): Promise<string[] | null> {
  if (isAdmin(viewer.role)) return null;
  if (!viewer.profile) return [];

  const managedProjects = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: viewer.profile.id,
      organization_id: organizationId,
      is_active: true,
      assignment_role: { in: ["lead", "manager"] },
    },
    select: { project_id: true },
  });
  const projectIds = managedProjects.map((assignment) => assignment.project_id);
  if (projectIds.length === 0) return [];

  const assignments = await prisma.project_assignments.findMany({
    where: {
      project_id: { in: projectIds },
      organization_id: organizationId,
      is_active: true,
    },
    select: { employee_profile_id: true },
    distinct: ["employee_profile_id"],
  });

  return assignments
    .map((assignment) => assignment.employee_profile_id)
    .filter((profileId) => profileId !== viewer.profile?.id);
}

export async function hasReviewScope(viewer: CurrentUser, organizationId: string): Promise<boolean> {
  if (isAdmin(viewer.role)) return true;
  const ids = await getReviewableProfileIds(viewer, organizationId);
  return Boolean(ids?.length);
}

export async function assertCanReviewProfile(viewer: CurrentUser, profileId: string, organizationId: string) {
  if (!(await canReviewProfile(viewer, profileId, organizationId))) {
    throw new Error("You are not authorized to review this employee.");
  }
}

/** Verify a period belongs to this org AND the viewer may review it. */
export async function assertCanReviewPeriod(viewer: CurrentUser, periodId: string, organizationId: string) {
  const period = await prisma.timesheet_periods.findFirst({
    where: { id: periodId, organization_id: organizationId },
    select: { employee_profile_id: true },
  });
  if (!period) throw new Error("Timesheet period not found.");
  await assertCanReviewProfile(viewer, period.employee_profile_id, organizationId);
  return period;
}

/** Verify an entry is the viewer's own, in this org, and its period editable. */
export async function assertOwnEditableEntry(
  user: { profile: { id: string } | null },
  entryId: string,
  organizationId: string,
) {
  if (!user.profile) throw new Error("No employee profile is linked to your account.");

  const entry = await prisma.time_entries.findFirst({
    where: { id: entryId, employee_profile_id: user.profile.id, organization_id: organizationId },
    include: { timesheet_period: { select: { status: true } } },
  });

  if (!entry) throw new Error("Time entry not found.");
  if (!isPeriodEditable(entry.timesheet_period.status)) {
    throw new Error("This timesheet period is locked.");
  }

  return entry;
}
