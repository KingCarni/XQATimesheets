import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LOGIN_PATH } from "@/lib/permissions/routes";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/types/domain";
import type { Row } from "@/types/database";
import { toEmployeeProfileRow } from "@/lib/timesheets/queries";

export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  profile: Row<"employee_profiles"> | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return null;

  const user = await prisma.users.findFirst({
    where: { id: sessionUserId, is_active: true },
    include: { employee_profile: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profile: user.employee_profile ? toEmployeeProfileRow(user.employee_profile) : null,
  };
}

/** Same as getCurrentUser but redirects to login when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/** Require one of the given roles, else send to the default landing page. */
export async function requireRole(...roles: AppRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/my-timesheet");
  return user;
}

export function isManagerOrAdmin(role: AppRole): boolean {
  return role === "manager" || role === "admin";
}
