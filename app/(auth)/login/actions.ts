"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { DEFAULT_AUTHED_PATH } from "@/lib/permissions/routes";

export type LoginState = { error: string | null };

/** Email + password sign-in. Wired to the login form via useActionState. */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "") || DEFAULT_AUTHED_PATH;

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  redirect(redirectTo);
}
