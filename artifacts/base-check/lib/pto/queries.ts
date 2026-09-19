import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";

export async function getPtoActivityTypes(organizationId: string) {
  return prisma.activity_types.findMany({
    where: { is_active: true, is_pto: true, organization_id: organizationId },
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getOwnPtoRequests(profileId: string, organizationId: string) {
  const rows = await prisma.pto_requests.findMany({
    where: { employee_profile_id: profileId, organization_id: organizationId },
    include: {
      activity_type: { select: { name: true } },
      approver: { select: { email: true } },
    },
    orderBy: [{ created_at: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    startDate: row.start_date.toISOString().slice(0, 10),
    endDate: row.end_date.toISOString().slice(0, 10),
    hoursPerDay: Number(row.hours_per_day),
    totalHours: Number(row.total_hours),
    status: row.status,
    notes: row.notes,
    typeName: row.activity_type.name,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approverEmail: row.approver?.email ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}

async function getManagedProjectIds(user: CurrentUser, organizationId: string) {
  if (!user.profile) return [] as string[];

  const assignments = await prisma.project_assignments.findMany({
    where: {
      employee_profile_id: user.profile.id,
      organization_id: organizationId,
      is_active: true,
      assignment_role: { in: ["lead", "manager"] },
    },
    select: { project_id: true },
  });

  return assignments.map((assignment) => assignment.project_id);
}

export async function getReviewablePtoRequests(user: CurrentUser, organizationId: string) {
  if (user.role === "employee") return [];

  const where =
    user.role === "admin"
      ? { organization_id: organizationId }
      : {
          organization_id: organizationId,
          employee_profile: {
            project_assignments: {
              some: {
                is_active: true,
                organization_id: organizationId,
                project_id: { in: await getManagedProjectIds(user, organizationId) },
              },
            },
          },
        };

  const rows = await prisma.pto_requests.findMany({
    where,
    include: {
      activity_type: { select: { name: true } },
      employee_profile: {
        select: {
          full_name: true,
          user: { select: { email: true } },
        },
      },
      approver: { select: { email: true } },
    },
    orderBy: [{ status: "asc" }, { start_date: "asc" }, { created_at: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    employeeName: row.employee_profile.full_name,
    employeeEmail: row.employee_profile.user.email,
    startDate: row.start_date.toISOString().slice(0, 10),
    endDate: row.end_date.toISOString().slice(0, 10),
    hoursPerDay: Number(row.hours_per_day),
    totalHours: Number(row.total_hours),
    status: row.status,
    notes: row.notes,
    typeName: row.activity_type.name,
    approvedAt: row.approved_at?.toISOString() ?? null,
    approverEmail: row.approver?.email ?? null,
  }));
}

export async function canReviewPtoRequest(user: CurrentUser, requestId: string, organizationId: string) {
  if (user.role === "admin") return true;
  if (user.role !== "manager" || !user.profile) return false;

  const managedProjectIds = await getManagedProjectIds(user, organizationId);
  if (!managedProjectIds.length) return false;

  const request = await prisma.pto_requests.findFirst({
    where: {
      id: requestId,
      organization_id: organizationId,
      employee_profile: {
        project_assignments: {
          some: {
            is_active: true,
            organization_id: organizationId,
            project_id: { in: managedProjectIds },
          },
        },
      },
    },
    select: { id: true },
  });

  return Boolean(request);
}
