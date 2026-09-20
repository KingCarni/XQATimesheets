import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/permissions/routes";
import { resolveTenantFromHost } from "@/lib/tenant/context";
import { LandingPage } from "@/components/marketing/landing-page";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();

  // On a tenant host, `/` is the workspace entry point, not the marketing site.
  const tenant = await resolveTenantFromHost();
  if (tenant) redirect(user ? DEFAULT_AUTHED_PATH : LOGIN_PATH);

  // Platform root: signed-in users go to their workspace; everyone else sees
  // the public MyHourVault marketing landing.
  if (user) redirect(DEFAULT_AUTHED_PATH);

  return <LandingPage />;
}
