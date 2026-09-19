"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tenantWorkspaceUrl } from "@/lib/tenant/urls";
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SLUG } from "./config";

/**
 * Sign the visitor into the shared, read-only demo workspace and send them to
 * its tenant host. Requires the demo to have been seeded (`prisma/seed-demo.mjs`);
 * if the demo account doesn't exist, we fall back to the marketing landing.
 */
export async function enterDemoAction(): Promise<void> {
  const demoUser = await prisma.users.findUnique({
    where: { email: DEMO_ADMIN_EMAIL },
    select: { id: true },
  });
  if (!demoUser) redirect("/?demo=unavailable");

  try {
    await signIn("credentials", {
      email: DEMO_ADMIN_EMAIL,
      password: DEMO_PASSWORD,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  redirect(await tenantWorkspaceUrl(DEMO_SLUG));
}
