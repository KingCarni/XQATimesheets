import "server-only";

import { prisma } from "@/lib/prisma";

export type AdminProjectDto = {
  id: string;
  name: string;
};

export type AdminEmployeeDto = {
  id: string;
  email: string;
  role: "employee" | "manager" | "admin";
  is_active: boolean;
  employee_profile: {
    id: string;
    full_name: string;
    employee_code: string | null;
    department: string | null;
    timezone: string;
    project_assignments: {
      project_id: string;
      assignment_role: "member" | "lead" | "manager";
      project: {
        name: string;
      };
    }[];
  } | null;
};

export async function getAdminEmployeeData(organizationId: string): Promise<{
  users: AdminEmployeeDto[];
  projects: AdminProjectDto[];
}> {
  const [rawUsers, rawProjects] = await Promise.all([
    prisma.users.findMany({
      // Only members of THIS organization.
      where: { organization_members: { some: { organization_id: organizationId } } },
      select: {
        id: true,
        email: true,
        role: true,
        is_active: true,
        employee_profile: {
          select: {
            id: true,
            full_name: true,
            employee_code: true,
            department: true,
            timezone: true,
            project_assignments: {
              where: {
                is_active: true,
                organization_id: organizationId,
              },
              select: {
                project_id: true,
                assignment_role: true,
                project: {
                  select: {
                    name: true,
                  },
                },
              },
              orderBy: {
                created_at: "asc",
              },
            },
          },
        },
      },
      orderBy: {
        email: "asc",
      },
    }),

    prisma.projects.findMany({
      where: {
        is_active: true,
        organization_id: organizationId,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const users: AdminEmployeeDto[] = rawUsers.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    employee_profile: user.employee_profile
      ? {
          id: user.employee_profile.id,
          full_name: user.employee_profile.full_name,
          employee_code: user.employee_profile.employee_code,
          department: user.employee_profile.department,
          timezone: user.employee_profile.timezone,
          project_assignments:
            user.employee_profile.project_assignments.map((assignment) => ({
              project_id: assignment.project_id,
              assignment_role: assignment.assignment_role,
              project: {
                name: assignment.project.name,
              },
            })),
        }
      : null,
  }));

  const projects: AdminProjectDto[] = rawProjects.map((project) => ({
    id: project.id,
    name: project.name,
  }));

  return {
    users,
    projects,
  };
}