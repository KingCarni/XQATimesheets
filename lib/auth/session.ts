import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/permissions/routes";
import type { AppRole } from "@/types/domain";
import type { Row } from "@/types/database";

export type CurrentUser = {
  id: string;
  email: string;
  role: AppRole;
  profile: Row<"employee_profiles"> | null;
};

/**
 * Load the signed-in user with their app role and employee profile.
 * Returns null when unauthenticated. The `users` row is the source of truth
 * for role; we fall back to auth metadata if the row is not yet provisioned.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("employee_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const role =
    userRow?.role ?? ((user.app_metadata?.role as AppRole | undefined) ?? "employee");

  return {
    id: user.id,
    email: userRow?.email ?? user.email ?? "",
    role,
    profile: profile ?? null,
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
