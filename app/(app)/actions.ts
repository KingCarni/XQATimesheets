"use server";

import { signOut as authSignOut } from "@/auth";
import { LOGIN_PATH } from "@/lib/permissions/routes";

export async function signOut() {
  await authSignOut({ redirectTo: LOGIN_PATH });
}
