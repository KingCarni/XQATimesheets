/**
 * Pure tenant-hostname resolution (no DB, no server-only imports) so it can be
 * used from middleware, server code, and tests alike.
 *
 * Production model:  <slug>.hourops.ca   → tenant "<slug>"
 *                    hourops.ca / www    → platform root (no tenant)
 * Local dev model:   <slug>.localhost    → tenant "<slug>"
 *                    localhost           → platform root (no tenant)
 *
 * Custom domains (e.g. time.acme.com) are NOT resolved here — they are looked
 * up by full hostname in `organization_domains` (see lib/tenant/context.ts), so
 * this stays a cheap, allocation-free string check.
 */

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "hourops.ca";

/** Subdomains that are platform/system-reserved and never map to a tenant. */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "login",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "demo",
  "support",
  "help",
  "mail",
  "email",
  "static",
  "assets",
  "cdn",
  "status",
  "blog",
  "docs",
  "dashboard",
  "onboarding",
  "auth",
  "account",
  "accounts",
  "billing",
  "hourops",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Normalize a user-entered slug candidate (does not guarantee validity). */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function stripPort(host: string): string {
  return host.split(":")[0].toLowerCase().replace(/\.$/, "");
}

/**
 * Returns the tenant slug encoded in a hostname's subdomain, or null for the
 * platform root / non-tenant hosts. Reserved and invalid subdomains return null.
 */
export function getTenantSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = stripPort(host);

  const bases = [ROOT_DOMAIN, "localhost"];
  for (const base of bases) {
    if (hostname === base) return null; // platform root
    const suffix = `.${base}`;
    if (hostname.endsWith(suffix)) {
      const label = hostname.slice(0, -suffix.length);
      // Only a single-label subdomain maps to a tenant (a.b.hourops.ca does not).
      if (!label || label.includes(".")) return null;
      if (isReservedSlug(label) || !isValidSlug(label)) return null;
      return label;
    }
  }

  // Bare IPs and anything else (potential custom domains) → resolved elsewhere.
  return null;
}

/** Build a tenant workspace URL for redirects/links. */
export function tenantHostname(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}
