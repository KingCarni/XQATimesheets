import "server-only";

import { prisma } from "@/lib/prisma";
import { isPeriodEditable, type AppRole } from "@/types/domain";
import type { CurrentUser } from "./session";

export function isAdmin(role: AppRole): boolean {
  return role === "admin";
}

export function isReviewerRole(role: AppRole): boolean {
  return role === "manager" || role === "admin";
}

export async function canReviewProfile(viewer: {
  id: string;
  role: AppRole;
  profile: { id: string } | null;
}, profileId: string): Promise<boolean> {
  if (isAdmin(viewer.role)) return true;
  if (!viewer.profile) return false;

  const managedAssignment = await prisma.project_assignments.findFirst({
    where: {
      employee_profile_id: viewer.profile.id,
      assignment_role: { in: ["manager", "lead"] },
      is_active: true,
      project: {
        project_assignments: {
          some: {
            employee_profile_id: profileId,
            is_active: true,
          },
        },
      },
    },
    select: { id: true },
  });

  return Boolean(managedAssignment);
}

export async function canViewProfile(viewer: {
  id: string;
  role: AppRole;
  profile: { id: string } | null;
}, profileId: string): Promise<boolean> {
  if (viewer.profile?.id === profileId) return true;
  if (await canReviewProfile(viewer, profileId)) return true;

  const directReport = await prisma.employee_profiles.findFirst({
    where: { id: profileId, manager_user_id: viewer.id },
    select: { id: true },
  });

  return Boolean(directReport);
}

export function reviewableProfileWhere(viewer: CurrentUser) {
  if (isAdmin(viewer.role)) return {};
  if (!viewer.profile) return { id: "__none__" };

  return {
    project_assignments: {
      some: {
        is_active: true,
        project: {
          project_assignments: {
            some: {
              employee_profile_id: viewer.profile.id,
              is_active: true,
              assignment_role: { in: ["lead", "manager"] as const },
            },
          },
        },
      },
    },
  };
}

export async function getReviewableProfileIds(viewer: CurrentUser): Promise<string[] | null> {
  if (isAdmin(viewer.role)) return null;
  if (!viewer.profile) return [];

  const managedProjects = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: viewer.profile.id,
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
      is_active: true,
    },
    select: { employee_profile_id: true },
    distinct: ["employee_profile_id"],
  });

  return assignments
    .map((assignment) => assignment.employee_profile_id)
    .filter((profileId) => profileId !== viewer.profile?.id);
}

export async function hasReviewScope(viewer: CurrentUser): Promise<boolean> {
  if (isAdmin(viewer.role)) return true;
  const ids = await getReviewableProfileIds(viewer);
  return Boolean(ids?.length);
}

export async function assertCanReviewProfile(viewer: CurrentUser, profileId: string) {
  if (!(await canReviewProfile(viewer, profileId))) {
    throw new Error("You are not authorized to review this employee.");
  }
}

export async function assertCanReviewPeriod(viewer: CurrentUser, periodId: string) {
  const period = await prisma.timesheet_periods.findUnique({
    where: { id: periodId },
    select: { employee_profile_id: true },
  });
  if (!period) throw new Error("Timesheet period not found.");
  await assertCanReviewProfile(viewer, period.employee_profile_id);
  return period;
}

export async function assertOwnEditableEntry(user: {
  profile: { id: string } | null;
}, entryId: string) {
  if (!user.profile) throw new Error("No employee profile is linked to your account.");

  const entry = await prisma.time_entries.findFirst({
    where: { id: entryId, employee_profile_id: user.profile.id },
    include: { timesheet_period: { select: { status: true } } },
  });

  if (!entry) throw new Error("Time entry not found.");
  if (!isPeriodEditable(entry.timesheet_period.status)) {
    throw new Error("This timesheet period is locked.");
  }

  return entry;
}
