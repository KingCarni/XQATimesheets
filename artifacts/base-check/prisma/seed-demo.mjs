/**
 * Seeds the read-only demo workspace: a synthetic "Acme QA Studio" organization
 * with employees, projects, and a couple of weeks of timesheet data so the demo
 * has something to show. Writes are blocked at runtime by the app's demo gate
 * (`assertOrganizationWritable`), so this seed is the only thing that ever
 * populates it.
 *
 * Run manually (not part of the normal migrate/seed flow), against a database
 * that already has the HourOps multi-tenant migration applied:
 *   node prisma/seed-demo.mjs
 *
 * Idempotent-ish: if the demo org already exists it exits without changes.
 */
import { loadEnvFile } from "node:process";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnvFile(".env.local");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Keep these in sync with lib/demo/config.ts
const DEMO_ORG_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_ORG_NAME = "Acme QA Studio";
const DEMO_SLUG = "acme";
const DEMO_ADMIN_EMAIL = "demo@acme-qa.example.com";
const DEMO_PASSWORD = "hourops-demo";
const DEMO_PRIMARY_COLOR = "#7c3aed";
const DEMO_ACCENT_COLOR = "#1e1b4b";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "hourops.ca";

/** Matches lib/auth/password.ts (scrypt$N$r$p$salt$key, base64url). */
function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
}

/** Monday of the week containing `d` (UTC). */
function mondayOf(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7; // days since Monday
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}
function addDays(d, n) {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

const existing = await prisma.organizations.findUnique({ where: { id: DEMO_ORG_ID }, select: { id: true } });
if (existing) {
  console.log("Demo org already exists — nothing to do.");
  await prisma.$disconnect();
  process.exit(0);
}

const now = new Date();

await prisma.$transaction(async (tx) => {
  // Organization + branding + domain
  await tx.organizations.create({
    data: {
      id: DEMO_ORG_ID,
      name: DEMO_ORG_NAME,
      slug: DEMO_SLUG,
      timezone: "America/Toronto",
      week_start: 1,
      is_demo: true,
      onboarding_step: "finish",
      onboarding_completed_at: now,
    },
  });
  await tx.organization_branding.create({
    data: { organization_id: DEMO_ORG_ID, primary_color: DEMO_PRIMARY_COLOR, accent_color: DEMO_ACCENT_COLOR },
  });
  await tx.organization_domains.create({
    data: {
      organization_id: DEMO_ORG_ID,
      hostname: `${DEMO_SLUG}.${ROOT_DOMAIN}`,
      type: "subdomain",
      verified: true,
      is_primary: true,
      verified_at: now,
    },
  });

  // Catalogs
  const platformData = [
    { name: "Windows", sort_order: 10 },
    { name: "iOS", sort_order: 30 },
    { name: "Android", sort_order: 40 },
    { name: "Web", sort_order: 50 },
    { name: "PlayStation", sort_order: 60 },
  ].map((p) => ({ ...p, organization_id: DEMO_ORG_ID }));
  await tx.platforms.createMany({ data: platformData });

  const activityData = [
    { name: "Functional Testing", category: "testing", is_billable: true, sort_order: 10 },
    { name: "Regression Testing", category: "testing", is_billable: true, sort_order: 20 },
    { name: "Bug Verification", category: "testing", is_billable: true, sort_order: 50 },
    { name: "Exploratory Testing", category: "testing", is_billable: true, sort_order: 60 },
    { name: "Automation", category: "engineering", is_billable: true, sort_order: 70 },
    { name: "Meeting", category: "overhead", sort_order: 80 },
    { name: "Documentation", category: "overhead", sort_order: 90 },
    { name: "Vacation", category: "pto", is_pto: true, sort_order: 200 },
    { name: "Sick Leave", category: "pto", is_pto: true, sort_order: 210 },
  ].map((a) => ({ ...a, organization_id: DEMO_ORG_ID }));
  await tx.activity_types.createMany({ data: activityData });

  const platforms = await tx.platforms.findMany({ where: { organization_id: DEMO_ORG_ID }, select: { id: true, name: true } });
  const activities = await tx.activity_types.findMany({ where: { organization_id: DEMO_ORG_ID }, select: { id: true, name: true, is_pto: true } });
  const platformByName = Object.fromEntries(platforms.map((p) => [p.name, p.id]));
  const activityByName = Object.fromEntries(activities.map((a) => [a.name, a.id]));

  // Projects
  const projectSeed = [
    { code: "NEBU", name: "Nebula", client_name: "Orion Games", requires_platform: true, color_token: "violet" },
    { code: "HELI", name: "Helix", client_name: "Vertex Interactive", requires_platform: true, color_token: "blue" },
    { code: "INT", name: "Internal", requires_platform: false, color_token: "slate" },
  ];
  await tx.projects.createMany({
    data: projectSeed.map((p) => ({ ...p, is_active: true, organization_id: DEMO_ORG_ID })),
  });
  const projects = await tx.projects.findMany({ where: { organization_id: DEMO_ORG_ID }, select: { id: true, name: true } });
  const projectByName = Object.fromEntries(projects.map((p) => [p.name, p.id]));

  // People: one admin + three employees.
  const people = [
    { email: DEMO_ADMIN_EMAIL, fullName: "Dana Reyes", role: "admin", dept: "Leadership", projects: ["Internal", "Nebula"] },
    { email: "sam.okafor@acme-qa.example.com", fullName: "Sam Okafor", role: "manager", dept: "QA", projects: ["Nebula", "Helix"] },
    { email: "priya.nair@acme-qa.example.com", fullName: "Priya Nair", role: "employee", dept: "QA", projects: ["Nebula"] },
    { email: "leo.martin@acme-qa.example.com", fullName: "Leo Martin", role: "employee", dept: "QA", projects: ["Helix"] },
  ];

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const profiles = [];
  for (const person of people) {
    const user = await tx.users.create({
      data: { email: person.email, role: person.role, is_active: true, password_hash: passwordHash },
      select: { id: true },
    });
    await tx.organization_members.create({
      data: { organization_id: DEMO_ORG_ID, user_id: user.id, role: person.role, is_active: true },
    });
    const profile = await tx.employee_profiles.create({
      data: {
        user_id: user.id,
        organization_id: DEMO_ORG_ID,
        full_name: person.fullName,
        department: person.dept,
        timezone: "America/Toronto",
        can_approve: person.role === "manager" || person.role === "admin",
      },
      select: { id: true },
    });
    for (const pname of person.projects) {
      await tx.project_assignments.create({
        data: {
          employee_profile_id: profile.id,
          project_id: projectByName[pname],
          organization_id: DEMO_ORG_ID,
          assignment_role: person.role === "manager" ? "lead" : "member",
        },
      });
    }
    profiles.push({ ...person, userId: user.id, profileId: profile.id });
  }

  // Two weeks of timesheets: last week (approved), this week (open).
  const thisMonday = mondayOf(now);
  const lastMonday = addDays(thisMonday, -7);
  const weeks = [
    { start: lastMonday, status: "approved" },
    { start: thisMonday, status: "open" },
  ];

  const workActivities = ["Functional Testing", "Regression Testing", "Bug Verification", "Exploratory Testing", "Automation", "Meeting", "Documentation"];

  for (const person of profiles) {
    for (const week of weeks) {
      const weekEnd = addDays(week.start, 6);
      // Build 5 weekdays x one entry of ~8h.
      const entries = [];
      for (let day = 0; day < 5; day += 1) {
        const entryDate = addDays(week.start, day);
        const projectName = person.projects[day % person.projects.length];
        const activityName = workActivities[day % workActivities.length];
        const needsPlatform = projectName !== "Internal";
        entries.push({
          entry_date: entryDate,
          project_id: projectByName[projectName],
          platform_id: needsPlatform ? platformByName["Web"] : null,
          activity_type_id: activityByName[activityName],
          hours: 8,
          description: `${activityName} on ${projectName}`,
        });
      }
      const totalHours = entries.reduce((s, e) => s + e.hours, 0);

      const period = await tx.timesheet_periods.create({
        data: {
          employee_profile_id: person.profileId,
          organization_id: DEMO_ORG_ID,
          week_start_date: week.start,
          week_end_date: weekEnd,
          expected_hours: 0,
          total_hours: totalHours,
          status: week.status,
          ...(week.status === "approved"
            ? { submitted_at: addDays(weekEnd, 1), submitted_by: person.userId }
            : {}),
        },
        select: { id: true },
      });

      await tx.time_entries.createMany({
        data: entries.map((e) => ({
          ...e,
          employee_profile_id: person.profileId,
          timesheet_period_id: period.id,
          organization_id: DEMO_ORG_ID,
          created_by: person.userId,
          updated_by: person.userId,
        })),
      });

      if (week.status === "approved") {
        const approver = profiles.find((p) => p.role === "manager" || p.role === "admin");
        await tx.approvals.create({
          data: {
            timesheet_period_id: period.id,
            organization_id: DEMO_ORG_ID,
            action: "approve",
            actor_user_id: approver ? approver.userId : person.userId,
            comment: "Looks good.",
          },
        });
      }
    }
  }

  // One approved vacation for the demo employee.
  const priya = profiles.find((p) => p.fullName === "Priya Nair");
  const admin = profiles.find((p) => p.role === "admin");
  if (priya) {
    const start = addDays(thisMonday, 12);
    await tx.pto_requests.create({
      data: {
        employee_profile_id: priya.profileId,
        organization_id: DEMO_ORG_ID,
        activity_type_id: activityByName["Vacation"],
        start_date: start,
        end_date: addDays(start, 2),
        hours_per_day: 8,
        total_hours: 24,
        status: "approved",
        notes: "Long weekend.",
        created_by: priya.userId,
        approved_by: admin ? admin.userId : priya.userId,
        approved_at: now,
      },
    });
  }
});

console.log(`Seeded demo org "${DEMO_ORG_NAME}" (${DEMO_SLUG}).`);
await prisma.$disconnect();
