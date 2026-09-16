import "server-only";

import { resolveTenantFromHost } from "@/lib/tenant/context";
import { getOrganizationSettings } from "@/lib/organizations/queries";

export type TenantBranding = {
  name: string;
  slug: string;
  hasLogo: boolean;
  primaryColor: string;
  accentColor: string;
};

/**
 * Branding for the organization implied by the current request hostname, or
 * null on the platform root / unknown hosts. Used to brand the public auth
 * pages (sign-in, invite) per tenant before a user is authenticated.
 */
export async function getTenantBrandingFromHost(): Promise<TenantBranding | null> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return null;
  const settings = await getOrganizationSettings(tenant.id);
  return {
    name: settings.name,
    slug: settings.slug,
    hasLogo: settings.hasLogo,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
  };
}
