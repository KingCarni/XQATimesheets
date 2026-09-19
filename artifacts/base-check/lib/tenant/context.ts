import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { LOGIN_PATH } from "@/lib/permissions/routes";
import type { AppRole } from "@/types/domain";
import { getTenantSlugFromHost } from "./resolve";

export type OrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  weekStart: number;
  isDemo: boolean;
  onboardingStep: string;
  onboardingCompletedAt: string | null;
};

export type OrganizationMembership = { role: AppRole; isActive: boolean };

export type OrganizationContext = {
  user: CurrentUser;
  organization: OrganizationSummary;
  membership: OrganizationMembership;
};

export type ContextResult =
  | { status: "ok"; context: OrganizationContext }
  | { status: "unauthenticated" }
  | { status: "not-member"; user: CurrentUser; organization: OrganizationSummary }
  | { status: "needs-org-selection"; user: CurrentUser; organizationCount: number };

function toSummary(org: {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  week_start: number;
  is_demo: boolean;
  onboarding_step: string;
  onboarding_completed_at: Date | null;
}): OrganizationSummary {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    timezone: org.timezone,
    weekStart: org.week_start,
    isDemo: org.is_demo,
    onboardingStep: org.onboarding_step,
    onboardingCompletedAt: org.onboarding_completed_at ? org.onboarding_completed_at.toISOString() : null,
  };
}

const ORG_SELECT = {
  id: true,
  slug: true,
  name: true,
  timezone: true,
  week_start: true,
  is_demo: true,
  onboarding_step: true,
  onboarding_completed_at: true,
} as const;

export async function getRequestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/**
 * Resolve the organization implied by the request hostname:
 *  - a `<slug>.hourops.ca` / `<slug>.localhost` subdomain, or
 *  - a full custom hostname registered in `organization_domains`.
 * Returns null for the platform root or an unknown host.
 */
export async function resolveTenantFromHost(): Promise<OrganizationSummary | null> {
  const host = await getRequestHost();
  const slug = getTenantSlugFromHost(host);

  if (slug) {
    const org = await prisma.organizations.findUnique({ where: { slug }, select: ORG_SELECT });
    return org ? toSummary(org) : null;
  }

  // Custom domain fallback: match the full hostname.
  if (host) {
    const hostname = host.split(":")[0].toLowerCase();
    const domain = await prisma.organization_domains.findUnique({
      where: { hostname },
      select: { verified: true, organization: { select: ORG_SELECT } },
    });
    if (domain?.verified && domain.organization) return toSummary(domain.organization);
  }

  return null;
}

/**
 * The authoritative organization context for the current request. Tenant
 * membership is verified against the database — never inferred from the URL
 * alone. On the platform root, the org is resolved from the user's single
 * active membership (which keeps localhost dev practical); with zero or several
 * memberships the caller must route to sign-in or an org chooser.
 */
export async function getOrganizationContext(): Promise<ContextResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "unauthenticated" };

  const tenant = await resolveTenantFromHost();

  if (tenant) {
    const membership = await prisma.organization_members.findUnique({
      where: { organization_id_user_id: { organization_id: tenant.id, user_id: user.id } },
      select: { role: true, is_active: true },
    });
    if (!membership || !membership.is_active) {
      return { status: "not-member", user, organization: tenant };
    }
    return {
      status: "ok",
      context: { user, organization: tenant, membership: { role: membership.role, isActive: membership.is_active } },
    };
  }

  // Platform root — derive from memberships.
  const memberships = await prisma.organization_members.findMany({
    where: { user_id: user.id, is_active: true },
    select: { role: true, organization: { select: ORG_SELECT } },
  });

  if (memberships.length === 1) {
    const m = memberships[0];
    return {
      status: "ok",
      context: { user, organization: toSummary(m.organization), membership: { role: m.role, isActive: true } },
    };
  }

  return { status: "needs-org-selection", user, organizationCount: memberships.length };
}

/**
 * Require an authenticated user who is an active member of the current
 * organization. Redirects unauthenticated users to login, non-members away,
 * and multi-org users to the chooser. This is the base gate every tenant page
 * and action must pass through before touching organization-owned data.
 */
export async function requireOrganizationContext(): Promise<OrganizationContext> {
  const result = await getOrganizationContext();
  switch (result.status) {
    case "ok":
      return result.context;
    case "unauthenticated":
      redirect(LOGIN_PATH);
    case "not-member":
      // Authenticated but not a member of this tenant — do not reveal existence.
      redirect(LOGIN_PATH);
    case "needs-org-selection":
      redirect("/select-organization");
  }
}

export async function requireOrganizationMember(...roles: AppRole[]): Promise<OrganizationContext> {
  const context = await requireOrganizationContext();
  if (roles.length > 0 && !roles.includes(context.membership.role)) {
    redirect("/my-timesheet");
  }
  return context;
}

export function requireOrganizationAdmin(): Promise<OrganizationContext> {
  return requireOrganizationMember("admin");
}

/** Manager OR admin membership. Project-scope is still enforced at query level. */
export function requireOrganizationReviewer(): Promise<OrganizationContext> {
  return requireOrganizationMember("manager", "admin");
}

/** Error thrown when a write is attempted against a read-only demo workspace. */
export class DemoReadOnlyError extends Error {
  constructor() {
    super("This is a read-only demo workspace. Sign up to make changes.");
    this.name = "DemoReadOnlyError";
  }
}

/**
 * Refuse writes to a demo organization. Demo tenants are seeded, shared,
 * read-only sandboxes; every mutating server action must pass through a
 * `requireWritable*` gate so read-only is enforced server-side, not just hidden
 * in the UI.
 */
export function assertOrganizationWritable(organization: OrganizationSummary): void {
  if (organization.isDemo) throw new DemoReadOnlyError();
}

export async function requireWritableOrganizationContext(): Promise<OrganizationContext> {
  const context = await requireOrganizationContext();
  assertOrganizationWritable(context.organization);
  return context;
}

export async function requireWritableOrganizationMember(...roles: AppRole[]): Promise<OrganizationContext> {
  const context = await requireOrganizationMember(...roles);
  assertOrganizationWritable(context.organization);
  return context;
}

export function requireWritableOrganizationAdmin(): Promise<OrganizationContext> {
  return requireWritableOrganizationMember("admin");
}

export function requireWritableOrganizationReviewer(): Promise<OrganizationContext> {
  return requireWritableOrganizationMember("manager", "admin");
}

/** Just the current organization id, for scoping queries. Throws if none. */
export async function getCurrentOrganizationId(): Promise<string> {
  const result = await getOrganizationContext();
  if (result.status !== "ok") throw new Error("No organization context for this request.");
  return result.context.organization.id;
}
