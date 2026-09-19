import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { isReservedSlug, isValidSlug, normalizeSlug } from "@/lib/tenant/resolve";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  seedOrganizationCatalog,
} from "./defaults";

export type CreateOrganizationInput = {
  companyName: string;
  slug: string;
  adminEmail: string;
  adminFullName: string;
  password: string;
  timezone?: string;
};

export type CreateOrganizationResult = {
  organizationId: string;
  slug: string;
  userId: string;
  email: string;
};

/**
 * Is `slug` free to claim? A slug is unavailable when it is reserved
 * (platform/system subdomains), malformed, or already taken by another org.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const normalized = normalizeSlug(slug);
  if (!isValidSlug(normalized) || isReservedSlug(normalized)) return false;
  const existing = await prisma.organizations.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });
  return existing === null;
}

/**
 * Create a brand-new organization together with its first admin. Everything
 * happens in one transaction: org (in the first onboarding step), default
 * branding, the primary subdomain, the admin user + owning membership + profile,
 * and the baseline platform/activity catalogs. Throws if the slug is taken or
 * the email already belongs to a user (accounts are global identities and must
 * never be silently overwritten).
 */
export async function createOrganizationWithAdmin(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const companyName = input.companyName.trim();
  const slug = normalizeSlug(input.slug);
  const email = input.adminEmail.trim().toLowerCase();
  const adminFullName = input.adminFullName.trim();
  const timezone = input.timezone?.trim() || "America/Vancouver";

  if (!companyName) throw new Error("Enter a company name.");
  if (!isValidSlug(slug) || isReservedSlug(slug)) throw new Error("That workspace address is not available.");
  if (!adminFullName) throw new Error("Enter your name.");
  if (input.password.length < 8) throw new Error("Choose a password with at least 8 characters.");

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const slugTaken = await tx.organizations.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) throw new Error("That workspace address is already taken.");

    const emailTaken = await tx.users.findUnique({ where: { email }, select: { id: true } });
    if (emailTaken) throw new Error("An account with that email already exists. Sign in instead.");

    const organization = await tx.organizations.create({
      data: {
        name: companyName,
        slug,
        timezone,
        onboarding_step: ONBOARDING_STEPS[0],
      },
      select: { id: true },
    });

    await tx.organization_branding.create({
      data: {
        organization_id: organization.id,
        primary_color: DEFAULT_PRIMARY_COLOR,
        accent_color: DEFAULT_ACCENT_COLOR,
      },
    });

    await tx.organization_domains.create({
      data: {
        organization_id: organization.id,
        hostname: `${slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || "hourops.ca"}`,
        type: "subdomain",
        verified: true,
        is_primary: true,
        verified_at: new Date(),
      },
    });

    const user = await tx.users.create({
      data: { email, role: "admin", is_active: true, password_hash: passwordHash },
      select: { id: true },
    });

    await tx.organization_members.create({
      data: { organization_id: organization.id, user_id: user.id, role: "admin", is_active: true },
    });

    await tx.employee_profiles.create({
      data: {
        user_id: user.id,
        organization_id: organization.id,
        full_name: adminFullName,
        timezone,
        can_approve: true,
      },
    });

    await seedOrganizationCatalog(tx, organization.id);

    await tx.audit_history.create({
      data: {
        entity_type: "organization",
        entity_id: organization.id,
        action: "create",
        actor_user_id: user.id,
        organization_id: organization.id,
        metadata: { name: companyName, slug },
      },
    });

    return { organizationId: organization.id, slug, userId: user.id, email };
  });
}
