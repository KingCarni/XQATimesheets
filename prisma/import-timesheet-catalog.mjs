/**
 * One-off / re-runnable catalog import derived from a historical XQA
 * timesheet export (`PROJECT NAME` / `PLATFORM` / `TASK NAME` columns).
 *
 * Populates the existing `projects`, `platforms`, and `activity_types`
 * catalogs with the real historical values so they show up in My Timesheet,
 * Admin, and Reports dropdowns/filters. No time entries are created or
 * modified — this script only ever touches catalog tables.
 *
 * Idempotent:
 *  - platforms/activity_types are keyed by their unique `name` column, so
 *    `createMany({ skipDuplicates: true })` never creates duplicates.
 *  - `projects.name` is not unique in the schema, so projects are inserted
 *    with an explicit find-or-create by name instead, and existing rows
 *    (e.g. "Electrum", "Apollo", "Internal") are left untouched.
 *
 * Excluded artifacts: "Projects", "Platforms", and "Tasks" are leaked
 * spreadsheet section/header labels, not real catalog values — they are
 * permanently excluded from import (see ARTIFACT_NAMES below), and any
 * already-imported row with exactly one of those names is removed on every
 * run by `cleanupArtifacts()`, as long as nothing references it (a
 * time_entries/entry_templates/project_assignments/pto_requests row) — if
 * something does reference it, the row is left in place and reported so no
 * historical record is ever modified or orphaned by this script.
 *
 * Run with: node prisma/import-timesheet-catalog.mjs
 */
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnvFile(".env.local");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Leaked spreadsheet section/header labels — never valid catalog values,
// regardless of which column they showed up in.
const ARTIFACT_NAMES = {
  projects: "Projects",
  platforms: "Platforms",
  activity_types: "Tasks",
};

// PROJECT NAME → project catalog. Excludes the "Projects" header artifact.
const PROJECT_NAMES = [
  "Electrum",
  "Surf Punk",
  "Dialogue",
  "Aurory",
  "Ultimate Sheep Raccoon",
  "Ultimate Chicken Horse",
  "Amnesia",
  "Band Together",
  "WorldWinner",
  "Tripeaks Solitaire",
  "Internal",
  "Solitaire Tripeaks Mgmt",
  "Panda",
  "Solitaire Tripeaks Dev",
  "Poe",
  "PVVK",
];

// PLATFORM → platform catalog. Excludes "N/A" (means "no platform").
// "Playstation 5" is normalized to match the existing "PlayStation" casing.
const PLATFORM_NAMES = [
  "Windows",
  "macOS",
  "iOS",
  "Android",
  "Web",
  "PlayStation",
  "Xbox",
  "Nintendo Switch",
  "Windows Desktop",
  "PlayStation 5",
  "Xbox One",
  "iOS + Android",
];

// TASK NAME → activity_types catalog.
const ACTIVITY_TYPES = [
  { name: "Functional Testing", category: "testing", is_billable: true },
  { name: "Regression Testing", category: "testing", is_billable: true },
  { name: "Test Plan Creation", category: "planning", is_billable: true },
  { name: "Test Case Writing", category: "planning", is_billable: true },
  { name: "Bug Verification", category: "testing", is_billable: true },
  { name: "Exploratory Testing", category: "testing", is_billable: true },
  { name: "Automation", category: "engineering", is_billable: true },
  { name: "Meeting", category: "overhead", is_billable: false },
  { name: "Documentation", category: "overhead", is_billable: false },
  { name: "Training", category: "overhead", is_billable: false },
  { name: "Vacation", category: "pto", is_pto: true },
  { name: "Sick Leave", category: "pto", is_pto: true },
  { name: "Statutory Holiday", category: "pto", is_pto: true },
  { name: "Unpaid Leave", category: "pto", is_pto: true },
  // From the historical export:
  { name: "AdHoc Testing", category: "testing", is_billable: true },
  { name: "Certification Testing", category: "testing", is_billable: true },
  { name: "Sanity Check", category: "testing", is_billable: true },
  { name: "Smoke Testing", category: "testing", is_billable: true },
  { name: "Development", category: "engineering", is_billable: true },
  { name: "Test Plan Overhaul", category: "planning", is_billable: true },
  { name: "Administrative Task", category: "overhead", is_billable: false },
  { name: "Onboarding", category: "overhead", is_billable: false },
  { name: "Process Improvements", category: "overhead", is_billable: false },
  { name: "Paid Time-Off", category: "pto", is_pto: true },
  { name: "Unpaid Time-Off", category: "pto", is_pto: true },
  { name: "Paid Non-Working Day", category: "pto", is_pto: true },
];

/**
 * Removes any catalog row whose name is exactly one of ARTIFACT_NAMES,
 * provided nothing references it. Exact-name match only — never touches a
 * merely-similar name (e.g. "Platforms" is removed, "iOS + Android" is not).
 * Never touches time_entries or any other historical record; a referenced
 * artifact row is left in place and reported instead of being force-removed
 * or having its references rewritten.
 */
async function cleanupArtifacts() {
  const removed = [];
  const skipped = [];

  // projects: "Projects"
  {
    const row = await prisma.projects.findFirst({ where: { name: ARTIFACT_NAMES.projects } });
    if (row) {
      const [assignments, entries, templates] = await Promise.all([
        prisma.project_assignments.count({ where: { project_id: row.id } }),
        prisma.time_entries.count({ where: { project_id: row.id } }),
        prisma.entry_templates.count({ where: { project_id: row.id } }),
      ]);
      const refs = assignments + entries + templates;
      if (refs === 0) {
        await prisma.projects.delete({ where: { id: row.id } });
        removed.push(`project "${row.name}" (${row.id})`);
      } else {
        skipped.push(
          `project "${row.name}" (${row.id}) — referenced by ${assignments} assignment(s), ${entries} time entr${entries === 1 ? "y" : "ies"}, ${templates} template(s); left in place`,
        );
      }
    }
  }

  // platforms: "Platforms"
  {
    const row = await prisma.platforms.findFirst({ where: { name: ARTIFACT_NAMES.platforms } });
    if (row) {
      const [entries, templates] = await Promise.all([
        prisma.time_entries.count({ where: { platform_id: row.id } }),
        prisma.entry_templates.count({ where: { platform_id: row.id } }),
      ]);
      const refs = entries + templates;
      if (refs === 0) {
        await prisma.platforms.delete({ where: { id: row.id } });
        removed.push(`platform "${row.name}" (${row.id})`);
      } else {
        skipped.push(
          `platform "${row.name}" (${row.id}) — referenced by ${entries} time entr${entries === 1 ? "y" : "ies"}, ${templates} template(s); left in place`,
        );
      }
    }
  }

  // activity_types: "Tasks"
  {
    const row = await prisma.activity_types.findFirst({ where: { name: ARTIFACT_NAMES.activity_types } });
    if (row) {
      const [entries, templates, pto] = await Promise.all([
        prisma.time_entries.count({ where: { activity_type_id: row.id } }),
        prisma.entry_templates.count({ where: { activity_type_id: row.id } }),
        prisma.pto_requests.count({ where: { activity_type_id: row.id } }),
      ]);
      const refs = entries + templates + pto;
      if (refs === 0) {
        await prisma.activity_types.delete({ where: { id: row.id } });
        removed.push(`activity type "${row.name}" (${row.id})`);
      } else {
        skipped.push(
          `activity type "${row.name}" (${row.id}) — referenced by ${entries} time entr${entries === 1 ? "y" : "ies"}, ${templates} template(s), ${pto} PTO request(s); left in place`,
        );
      }
    }
  }

  return { removed, skipped };
}

async function importProjects() {
  let created = 0;
  for (const [index, name] of PROJECT_NAMES.entries()) {
    const existing = await prisma.projects.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.projects.create({
      data: {
        name,
        requires_platform: false,
      },
    });
    created += 1;
    void index;
  }
  return created;
}

async function importPlatforms() {
  const existingMax = await prisma.platforms.aggregate({ _max: { sort_order: true } });
  const base = (existingMax._max.sort_order ?? 0) + 10;
  const result = await prisma.platforms.createMany({
    data: PLATFORM_NAMES.map((name, i) => ({ name, sort_order: base + i * 10 })),
    skipDuplicates: true,
  });
  return result.count;
}

async function importActivityTypes() {
  const existingMax = await prisma.activity_types.aggregate({ _max: { sort_order: true } });
  const base = (existingMax._max.sort_order ?? 0) + 10;
  const result = await prisma.activity_types.createMany({
    data: ACTIVITY_TYPES.map((activity, i) => ({
      name: activity.name,
      category: activity.category,
      is_billable: activity.is_billable ?? false,
      is_pto: activity.is_pto ?? false,
      sort_order: base + i * 10,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

const { removed, skipped } = await cleanupArtifacts();
if (removed.length) {
  console.log(`Removed ${removed.length} artifact record(s):`);
  for (const line of removed) console.log(`  - ${line}`);
} else {
  console.log("No artifact records to remove.");
}
if (skipped.length) {
  console.log(`Left ${skipped.length} artifact record(s) in place (referenced by other data):`);
  for (const line of skipped) console.log(`  - ${line}`);
}

const [projectsCreated, platformsCreated, activityTypesCreated] = await Promise.all([
  importProjects(),
  importPlatforms(),
  importActivityTypes(),
]);

console.log(
  `Catalog import complete: +${projectsCreated} projects, +${platformsCreated} platforms, +${activityTypesCreated} activity types.`,
);

await prisma.$disconnect();
