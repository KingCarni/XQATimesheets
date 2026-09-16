import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Employee directory — a SAFE, profile-style view any authenticated employee
 * may browse. This is deliberately NOT the admin employee-management surface:
 * only directory-safe fields are ever selected here. Private/admin data
 * (email, PTO/sick balances, contracts, equipment, hardware requests, codes,
 * approval history, notes, auth) is never queried into these DTOs.
 */

export type DirectoryEntry = {
  profileId: string;
  fullName: string;
  nickname: string | null;
  pronouns: string | null;
  department: string | null;
  location: string | null;
  role: string;
  linkedinUrl: string | null;
  projects: string[];
  avatarUrl: string | null;
  tenureLabel: string | null;
  joinedLabel: string | null;
};

export type DirectoryFilters = {
  organizationId: string;
  name?: string;
  department?: string;
  project?: string;
};

function tenureLabel(start: Date): string {
  const now = new Date();
  let months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  if (now.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  parts.push(`${rem} month${rem === 1 ? "" : "s"}`);
  // Organization-neutral: never assume the tenant is a specific company.
  return `With the team for ${parts.join(", ")}`;
}

function joinedLabel(start: Date): string {
  return `Joined ${start.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}

export async function getDirectory(filters: DirectoryFilters): Promise<DirectoryEntry[]> {
  const name = filters.name?.trim();
  const rows = await prisma.employee_profiles.findMany({
    where: {
      organization_id: filters.organizationId,
      user: { is_active: true },
      ...(name
        ? {
            OR: [
              { full_name: { contains: name, mode: "insensitive" } },
              { nickname: { contains: name, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.project
        ? {
            project_assignments: {
              some: { is_active: true, organization_id: filters.organizationId, project_id: filters.project },
            },
          }
        : {}),
    },
    select: {
      id: true,
      full_name: true,
      nickname: true,
      pronouns: true,
      department: true,
      location: true,
      linkedin_url: true,
      avatar_updated_at: true,
      start_date: true,
      user: { select: { role: true } },
      project_assignments: {
        where: { is_active: true, organization_id: filters.organizationId },
        select: { project: { select: { name: true } } },
        orderBy: { created_at: "asc" },
      },
      contracts: { orderBy: { start_date: "asc" }, take: 1, select: { start_date: true } },
    },
    orderBy: { full_name: "asc" },
  });

  return rows.map((row) => {
    const start = row.start_date ?? row.contracts[0]?.start_date ?? null;
    return {
      profileId: row.id,
      fullName: row.full_name,
      nickname: row.nickname,
      pronouns: row.pronouns,
      department: row.department,
      location: row.location,
      role: row.user.role,
      linkedinUrl: row.linkedin_url,
      projects: row.project_assignments.map((a) => a.project.name),
      avatarUrl: row.avatar_updated_at
        ? `/api/avatars/${row.id}?v=${row.avatar_updated_at.getTime()}`
        : null,
      tenureLabel: start ? tenureLabel(start) : null,
      joinedLabel: start ? joinedLabel(start) : null,
    };
  });
}

/** Distinct departments + active projects for the directory filter controls. */
export async function getDirectoryFilterOptions(organizationId: string): Promise<{
  departments: string[];
  projects: { id: string; name: string }[];
}> {
  const [profiles, projects] = await Promise.all([
    prisma.employee_profiles.findMany({
      where: { organization_id: organizationId, user: { is_active: true }, department: { not: null } },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    prisma.projects.findMany({
      where: { is_active: true, organization_id: organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    departments: profiles.map((p) => p.department).filter((d): d is string => Boolean(d)),
    projects,
  };
}
