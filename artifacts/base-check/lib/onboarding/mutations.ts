import "server-only";

import { prisma } from "@/lib/prisma";
import type { PayrollPeriod } from "@/types/domain";
import { isOnboardingStep, type OnboardingStep } from "./steps";

/**
 * Persist the onboarding step for an org. This is the authoritative record of
 * where setup is; it is always written server-side after a step's data is saved,
 * never trusted from the client.
 */
export async function setOnboardingStep(
  organizationId: string,
  step: OnboardingStep,
): Promise<void> {
  if (!isOnboardingStep(step)) throw new Error("Unknown onboarding step.");
  await prisma.organizations.update({
    where: { id: organizationId },
    data: { onboarding_step: step },
  });
}

export type CompanyDetailsInput = {
  name: string;
  timezone: string;
  weekStart: number;
  payrollPeriod: PayrollPeriod | null;
};

/** Save the company-details step. */
export async function saveCompanyDetails(
  organizationId: string,
  input: CompanyDetailsInput,
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter a company name.");
  const weekStart = input.weekStart === 0 ? 0 : 1;
  await prisma.organizations.update({
    where: { id: organizationId },
    data: {
      name,
      timezone: input.timezone.trim() || "America/Vancouver",
      week_start: weekStart,
      payroll_period: input.payrollPeriod,
    },
  });
}

export type BrandingInput = {
  primaryColor: string;
  accentColor: string;
  logo?: { mime: string; bytes: Uint8Array<ArrayBuffer> } | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Save the branding step (colours and, optionally, a replacement logo). */
export async function saveBranding(organizationId: string, input: BrandingInput): Promise<void> {
  const primary = input.primaryColor.trim().toLowerCase();
  const accent = input.accentColor.trim().toLowerCase();
  if (!HEX_RE.test(primary) || !HEX_RE.test(accent)) {
    throw new Error("Colours must be 6-digit hex values, e.g. #127fc4.");
  }

  await prisma.organization_branding.upsert({
    where: { organization_id: organizationId },
    create: {
      organization_id: organizationId,
      primary_color: primary,
      accent_color: accent,
      ...(input.logo
        ? { logo_mime: input.logo.mime, logo_bytes: input.logo.bytes, logo_updated_at: new Date() }
        : {}),
    },
    update: {
      primary_color: primary,
      accent_color: accent,
      ...(input.logo
        ? { logo_mime: input.logo.mime, logo_bytes: input.logo.bytes, logo_updated_at: new Date() }
        : {}),
    },
  });
}

/** Mark onboarding complete. Idempotent: a second call keeps the first timestamp. */
export async function completeOnboarding(organizationId: string, actorUserId: string): Promise<void> {
  const org = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { onboarding_completed_at: true },
  });
  if (org?.onboarding_completed_at) return;

  await prisma.$transaction([
    prisma.organizations.update({
      where: { id: organizationId },
      data: { onboarding_step: "finish", onboarding_completed_at: new Date() },
    }),
    prisma.audit_history.create({
      data: {
        entity_type: "organization",
        entity_id: organizationId,
        action: "onboarding_complete",
        actor_user_id: actorUserId,
        organization_id: organizationId,
      },
    }),
  ]);
}
