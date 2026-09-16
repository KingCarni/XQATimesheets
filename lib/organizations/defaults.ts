import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Neutral HourOps brand colours applied to every new organization that hasn't
 * set its own. These are the HourOps defaults (deep navy + electric blue) — a
 * new tenant must never inherit another organization's (e.g. XQA's) colours.
 */
export const DEFAULT_PRIMARY_COLOR = "#087bea";
export const DEFAULT_ACCENT_COLOR = "#061b35";

/**
 * Baseline platform and activity catalogs seeded into each new organization so
 * the workspace is immediately usable (an employee can log time on day one).
 * Mirrors `prisma/seed.mjs` but is scoped to a single tenant.
 */
const DEFAULT_PLATFORMS: { name: string; sort_order: number }[] = [
  { name: "Windows", sort_order: 10 },
  { name: "macOS", sort_order: 20 },
  { name: "iOS", sort_order: 30 },
  { name: "Android", sort_order: 40 },
  { name: "Web", sort_order: 50 },
  { name: "PlayStation", sort_order: 60 },
  { name: "Xbox", sort_order: 70 },
  { name: "Nintendo Switch", sort_order: 80 },
];

const DEFAULT_ACTIVITY_TYPES: {
  name: string;
  category: string;
  is_billable?: boolean;
  is_pto?: boolean;
  sort_order: number;
}[] = [
  { name: "Functional Testing", category: "testing", is_billable: true, sort_order: 10 },
  { name: "Regression Testing", category: "testing", is_billable: true, sort_order: 20 },
  { name: "Test Plan Creation", category: "planning", is_billable: true, sort_order: 30 },
  { name: "Test Case Writing", category: "planning", is_billable: true, sort_order: 40 },
  { name: "Bug Verification", category: "testing", is_billable: true, sort_order: 50 },
  { name: "Exploratory Testing", category: "testing", is_billable: true, sort_order: 60 },
  { name: "Automation", category: "engineering", is_billable: true, sort_order: 70 },
  { name: "Meeting", category: "overhead", sort_order: 80 },
  { name: "Documentation", category: "overhead", sort_order: 90 },
  { name: "Training", category: "overhead", sort_order: 100 },
  { name: "Vacation", category: "pto", is_pto: true, sort_order: 200 },
  { name: "Sick Leave", category: "pto", is_pto: true, sort_order: 210 },
  { name: "Statutory Holiday", category: "pto", is_pto: true, sort_order: 220 },
  { name: "Unpaid Leave", category: "pto", is_pto: true, sort_order: 230 },
];

/** Seed the baseline platform/activity catalogs for a freshly created org. */
export async function seedOrganizationCatalog(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.platforms.createMany({
    data: DEFAULT_PLATFORMS.map((p) => ({ ...p, organization_id: organizationId })),
  });
  await tx.activity_types.createMany({
    data: DEFAULT_ACTIVITY_TYPES.map((a) => ({ ...a, organization_id: organizationId })),
  });
}
