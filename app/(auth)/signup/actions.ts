"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { createOrganizationWithAdmin } from "@/lib/organizations/create";
import { normalizeSlug } from "@/lib/tenant/resolve";

export type SignupState = { error: string | null };

/**
 * Create a company + its first admin, then sign that admin in and drop them into
 * onboarding. Slug/email uniqueness and password strength are all enforced
 * server-side inside `createOrganizationWithAdmin`.
 */
export async function createCompanyAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const adminFullName = String(formData.get("adminFullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password !== confirm) return { error: "The passwords do not match." };

  // Fall back to a slug derived from the company name if none was entered.
  const slug = normalizeSlug(slugRaw || companyName);

  try {
    await createOrganizationWithAdmin({ companyName, slug, adminEmail: email, adminFullName, password });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the workspace." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  redirect("/onboarding");
}
