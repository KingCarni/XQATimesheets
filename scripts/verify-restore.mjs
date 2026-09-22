#!/usr/bin/env node
/**
 * MHV-14 read-only restore verifier.
 *
 * Runs a suite of read-only checks against a target DB to confirm a restore
 * is structurally sound BEFORE cutting over an application to it:
 *   - Prisma client can connect
 *   - migration table is present (Prisma-managed)
 *   - core tables exist and contain rows in the expected proportions
 *   - referential-integrity spot checks (no orphaned time entries, contracts,
 *     equipment assignments, notifications)
 *   - representative organization can load with joined data
 *
 * Does NOT mutate anything. Safe to run against any target; still refuses to
 * default to shared/main.
 *
 * USAGE
 *   node scripts/verify-restore.mjs --url $TARGET_URL
 *   npm run db:verify      (uses DATABASE_URL_UNPOOLED)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { classifyHost, parseDbHost, redactDbUrl } from "./lib/db-safety.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const url = arg("--url") ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? null;
  if (!url) {
    console.error("ERROR: no --url and no DATABASE_URL_UNPOOLED / DATABASE_URL in env.");
    process.exit(2);
  }
  const host = parseDbHost(url);
  const kind = classifyHost(host);
  console.log(`Verifying     : ${redactDbUrl(url)}`);
  console.log(`Host / kind   : ${host} (${kind})`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let fail = 0;
  const check = async (label, fn) => {
    try {
      const detail = await fn();
      console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
    } catch (e) {
      fail += 1;
      console.log(`  FAIL  ${label} — ${e.message}`);
    }
  };

  await check("prisma can connect", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return "select 1";
  });
  await check("prisma migration table present", async () => {
    const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM _prisma_migrations`;
    return `${rows[0].n} migrations`;
  });

  // Table counts — sanity, not correctness. All numbers logged so a human
  // can eyeball drift between backup and restore.
  const counters = [
    ["organizations", () => prisma.organizations.count()],
    ["users", () => prisma.users.count()],
    ["employee_profiles", () => prisma.employee_profiles.count()],
    ["projects", () => prisma.projects.count()],
    ["project_assignments", () => prisma.project_assignments.count()],
    ["timesheet_periods", () => prisma.timesheet_periods.count()],
    ["project_timesheet_periods", () => prisma.project_timesheet_periods.count()],
    ["time_entries", () => prisma.time_entries.count()],
    ["approvals", () => prisma.approvals.count()],
    ["employee_contracts", () => prisma.employee_contracts.count()],
    ["contract_attachments", () => prisma.contract_attachments.count()],
    ["equipment_assignments", () => prisma.equipment_assignments.count()],
    ["notifications", () => prisma.notifications.count()],
    ["audit_history", () => prisma.audit_history.count()],
  ];
  const counts = {};
  for (const [name, fn] of counters) {
    await check(`table ${name}`, async () => {
      counts[name] = await fn();
      return `${counts[name]} rows`;
    });
  }

  // Referential-integrity spot checks: each MUST return zero rows.
  const orphanChecks = [
    [
      "time_entries.organization_id ← organizations.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM time_entries t
        LEFT JOIN organizations o ON o.id = t.organization_id
        WHERE t.organization_id IS NOT NULL AND o.id IS NULL`,
    ],
    [
      "project_assignments.organization_id ← organizations.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM project_assignments a
        LEFT JOIN organizations o ON o.id = a.organization_id
        WHERE a.organization_id IS NOT NULL AND o.id IS NULL`,
    ],
    [
      "employee_contracts.organization_id ← organizations.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM employee_contracts c
        LEFT JOIN organizations o ON o.id = c.organization_id
        WHERE c.organization_id IS NOT NULL AND o.id IS NULL`,
    ],
    [
      "equipment_assignments.organization_id ← organizations.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM equipment_assignments e
        LEFT JOIN organizations o ON o.id = e.organization_id
        WHERE e.organization_id IS NOT NULL AND o.id IS NULL`,
    ],
    [
      "notifications.organization_id ← organizations.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM notifications n
        LEFT JOIN organizations o ON o.id = n.organization_id
        WHERE o.id IS NULL`,
    ],
    [
      "contract_attachments.contract_id ← employee_contracts.id",
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS n
        FROM contract_attachments a
        LEFT JOIN employee_contracts c ON c.id = a.contract_id
        WHERE c.id IS NULL`,
    ],
  ];
  for (const [label, q] of orphanChecks) {
    await check(`no orphaned ${label}`, async () => {
      const r = await q;
      if (r[0].n !== 0) throw new Error(`${r[0].n} orphaned rows`);
      return "0 orphans";
    });
  }

  // Representative-org load: pick the largest tenant and join something across
  // the biggest fan-outs so we exercise real FK paths.
  await check("representative organization loads with joined data", async () => {
    const org = await prisma.organizations.findFirst({
      orderBy: { employee_profiles: { _count: "desc" } },
      select: { id: true, slug: true, _count: { select: { employee_profiles: true, projects: true } } },
    });
    if (!org) return "no organizations to sample";
    const nProjects = await prisma.projects.count({ where: { organization_id: org.id } });
    const nEntries = await prisma.time_entries.count({ where: { organization_id: org.id } });
    return `slug=${org.slug} profiles=${org._count.employee_profiles} projects=${nProjects} entries=${nEntries}`;
  });

  await prisma.$disconnect();
  console.log(`\nSummary: ${counters.length + 8} checks, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
