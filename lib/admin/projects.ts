import "server-only";

import { prisma } from "@/lib/prisma";

export type AdminProjectRow = {
  id: string;
  name: string;
  requires_platform: boolean;
  is_active: boolean;
  assignmentCount: number;
};

/** All projects (active and inactive) for the admin Project Management page. */
export async function getAdminProjectListData(): Promise<AdminProjectRow[]> {
  const rows = await prisma.projects.findMany({
    select: {
      id: true,
      name: true,
      requires_platform: true,
      is_active: true,
      _count: { select: { project_assignments: { where: { is_active: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    requires_platform: row.requires_platform,
    is_active: row.is_active,
    assignmentCount: row._count.project_assignments,
  }));
}
