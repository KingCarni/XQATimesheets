import "server-only";

import { prisma } from "@/lib/prisma";
import { dateOnly } from "@/lib/timesheets/queries";
import type { CurrentUser } from "@/lib/auth/session";

export type ProfileOverview = {
  fullName: string;
  email: string;
  role: string;
  employeeCode: string | null;
  department: string | null;
  timezone: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  projects: { name: string; role: string }[];
  nickname: string | null;
  pronouns: string | null;
  location: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
};

/**
 * Self-service overview for the signed-in employee. Only non-sensitive,
 * self-relevant fields are surfaced (no admin-only internals). The caller is
 * always the owner — the profile is resolved from the session user.
 */
export async function getProfileOverview(
  user: CurrentUser,
  organizationId: string,
): Promise<ProfileOverview | null> {
  if (!user.profile) return null;

  const profile = await prisma.employee_profiles.findFirst({
    where: { id: user.profile.id, organization_id: organizationId },
    include: {
      project_assignments: {
        where: { is_active: true, organization_id: organizationId },
        include: { project: { select: { name: true } } },
        orderBy: { created_at: "asc" },
      },
    },
  });
  if (!profile) return null;

  return {
    fullName: profile.full_name,
    email: user.email,
    role: user.role,
    employeeCode: profile.employee_code,
    department: profile.department,
    timezone: profile.timezone,
    isActive: true, // the signed-in user is always active — getCurrentUser filters on is_active
    startDate: profile.start_date ? dateOnly(profile.start_date) : null,
    endDate: profile.end_date ? dateOnly(profile.end_date) : null,
    projects: profile.project_assignments.map((a) => ({ name: a.project.name, role: a.assignment_role })),
    nickname: profile.nickname,
    pronouns: profile.pronouns,
    location: profile.location,
    linkedinUrl: profile.linkedin_url,
    avatarUrl: profile.avatar_updated_at
      ? `/api/avatars/${profile.id}?v=${profile.avatar_updated_at.getTime()}`
      : null,
  };
}
