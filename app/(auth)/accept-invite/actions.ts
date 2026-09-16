"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { DEFAULT_AUTHED_PATH } from "@/lib/permissions/routes";
import { acceptInvitation } from "@/lib/invitations/queries";

export type AcceptState = { error: string | null };

/**
 * Create the invited user's account and sign them in. The token is re-validated
 * server-side inside `acceptInvitation`; nothing about the target org, role, or
 * email is trusted from the client — only the raw token and the chosen password.
 */
export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get("token") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password !== confirm) return { error: "The passwords do not match." };

  let email: string;
  try {
    const result = await acceptInvitation({ token, fullName, password });
    email = result.email;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not accept the invitation." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: DEFAULT_AUTHED_PATH });
  } catch (error) {
    if (error instanceof AuthError) {
      // Account was created; sending them to sign in is a safe fallback.
      redirect("/login");
    }
    throw error;
  }

  redirect(DEFAULT_AUTHED_PATH);
}
