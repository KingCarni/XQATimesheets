import "server-only";

import { headers } from "next/headers";

import { getRequestHost } from "./context";
import { ROOT_DOMAIN } from "./resolve";

/**
 * Build an absolute URL on the *current* request's origin. Used for
 * copy-able links (e.g. invitation accept links) so a link works in whatever
 * environment it was generated in — `localhost:3000`, an `<slug>.localhost`
 * dev subdomain, or a production tenant host — without hard-coding a scheme.
 */
export async function buildAbsoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = (await getRequestHost()) ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${normalizedPath}`;
}

export async function buildAcceptInviteUrl(token: string): Promise<string> {
  return buildAbsoluteUrl(`/accept-invite?token=${encodeURIComponent(token)}`);
}

/**
 * The absolute origin of a tenant's workspace, derived from the current
 * request's host so it is correct in every environment: `<slug>.myhourvault.com` in
 * production and `<slug>.localhost:<port>` in local dev. Selecting an org in the
 * chooser navigates here — tenancy is host-based, so the destination host IS the
 * organization selection.
 */
export async function tenantWorkspaceUrl(slug: string, path = "/"): Promise<string> {
  const host = (await getRequestHost()) ?? "localhost:3000";
  const [hostname, port] = host.split(":");
  const isLocal = hostname === "localhost" || hostname.endsWith(".localhost");
  const base = isLocal ? "localhost" : ROOT_DOMAIN;
  const portSuffix = port ? `:${port}` : "";
  const proto = isLocal ? "http" : ((await headers()).get("x-forwarded-proto") ?? "https");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${slug}.${base}${portSuffix}${normalizedPath}`;
}
