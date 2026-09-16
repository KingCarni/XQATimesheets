import "server-only";

import { prisma } from "@/lib/prisma";
import type { AppRole, PayrollPeriod } from "@/types/domain";
import { DEFAULT_ACCENT_COLOR, DEFAULT_PRIMARY_COLOR } from "./defaults";

export type OrganizationSettings = {
  name: string;
  slug: string;
  timezone: string;
  weekStart: number;
  payrollPeriod: PayrollPeriod | null;
  primaryColor: string;
  accentColor: string;
  hasLogo: boolean;
};

/** Company + branding settings for the onboarding/company admin screens. */
export async function getOrganizationSettings(organizationId: string): Promise<OrganizationSettings> {
  const org = await prisma.organizations.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      name: true,
      slug: true,
      timezone: true,
      week_start: true,
      payroll_period: true,
      branding: { select: { primary_color: true, accent_color: true, logo_updated_at: true } },
    },
  });

  return {
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    weekStart: org.week_start,
    payrollPeriod: org.payroll_period,
    primaryColor: org.branding?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    accentColor: org.branding?.accent_color ?? DEFAULT_ACCENT_COLOR,
    hasLogo: Boolean(org.branding?.logo_updated_at),
  };
}

export type UserMembership = {
  organizationId: string;
  name: string;
  slug: string;
  role: AppRole;
  isDemo: boolean;
  hasLogo: boolean;
  primaryColor: string;
  accentColor: string;
};

/** A user's active organization memberships, for the org chooser. */
export async function getUserMemberships(userId: string): Promise<UserMembership[]> {
  const rows = await prisma.organization_members.findMany({
    where: { user_id: userId, is_active: true },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          is_demo: true,
          branding: { select: { primary_color: true, accent_color: true, logo_updated_at: true } },
        },
      },
    },
    orderBy: { organization: { name: "asc" } },
  });

  return rows.map((r) => ({
    organizationId: r.organization.id,
    name: r.organization.name,
    slug: r.organization.slug,
    role: r.role,
    isDemo: r.organization.is_demo,
    hasLogo: Boolean(r.organization.branding?.logo_updated_at),
    primaryColor: r.organization.branding?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    accentColor: r.organization.branding?.accent_color ?? DEFAULT_ACCENT_COLOR,
  }));
}
