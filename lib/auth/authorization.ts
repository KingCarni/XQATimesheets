import "server-only";

import { prisma } from "@/lib/prisma";
import { isPeriodEditable, type AppRole } from "@/types/domain";

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
  if (!viewer.profile || !isReviewerRole(viewer.role)) return false;

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
