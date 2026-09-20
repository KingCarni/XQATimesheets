/**
 * MHV-8 follow-up — backfill operational (project-scoped) submission periods
 * from existing time_entries.
 *
 * WHY A SCRIPT (not SQL): the boundary math (biweekly anchor alignment, monthly
 * 26→25 style boundaries, semi-monthly split) lives in the pure, tested
 * `lib/pay-periods/calc.ts`. Re-implementing it in SQL would risk drift, so we
 * reuse the exact same functions here.
 *
 * SAFETY
 * ------
 *   * DRY-RUN BY DEFAULT. It prints what it WOULD do and writes nothing.
 *     Pass `--apply` to actually write. Pass `--confirm-host <substr>` and the
 *     target host must contain <substr>, a guard against pointing at the wrong DB.
 *   * Idempotent: rows are upserted on (employee, project, period_start) and an
 *     entry is only (re)pointed when its project_period_id is NULL or wrong.
 *   * NEVER run against shared/prod Neon. Intended for a DISPOSABLE Neon branch
 *     that already has the MHV-8 migration applied.
 *
 * WHAT IT DOES
 *   For every time entry that HAS a project:
 *     1. resolve the project's effective config (project → org → legacy weekly),
 *     2. compute the operational period containing entry_date,
 *     3. upsert one project_timesheet_periods row (boundaries frozen on create),
 *     4. set the entry's project_period_id.
 *
 * STATUS DERIVATION (documented policy)
 *   A new project period inherits the MOST RESTRICTIVE status among the legacy
 *   weekly periods whose entries fall into it (locked > approved > submitted >
 *   rejected > open), copying submitted_at/by, locked_at/by, rejection_reason
 *   from that governing legacy period. This preserves the immutability of work
 *   that was already submitted/approved/locked. Conflicts (entries from legacy
 *   periods with differing statuses collapsing into one operational period) are
 *   reported so a human can review before `--apply`.
 *
 * ENTRIES WITHOUT A PROJECT
 *   Cannot belong to a project-scoped unit; they are counted and skipped, never
 *   forced into an arbitrary project. Decide their handling separately.
 */
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { resolveEffectivePayPeriodConfig } from "../../lib/pay-periods/calc.ts";
import { getPayPeriodForDate } from "../../lib/pay-periods/calc.ts";

loadEnvFile(".env.local");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const confirmIdx = process.argv.indexOf("--confirm-host");
const CONFIRM_HOST = confirmIdx >= 0 ? process.argv[confirmIdx + 1] : null;

const STATUS_RANK = { open: 0, rejected: 1, submitted: 2, approved: 3, locked: 4 };
const dateOnly = (d) => d.toISOString().slice(0, 10);
const dateInput = (s) => new Date(`${s}T00:00:00.000Z`);

function orgRow(o) {
  return {
    payrollPeriod: o.payroll_period,
    payrollStartWeekday: o.payroll_start_weekday,
    payrollAnchorDate: o.payroll_anchor_date ? dateOnly(o.payroll_anchor_date) : null,
    payrollSemimonthlyDay: o.payroll_semimonthly_day,
    payrollMonthlyStartDay: o.payroll_monthly_start_day,
  };
}
function projectRow(p) {
  return {
    payrollPeriodOverride: p.payroll_period_override,
    payrollStartWeekday: p.payroll_start_weekday,
    payrollAnchorDate: p.payroll_anchor_date ? dateOnly(p.payroll_anchor_date) : null,
    payrollSemimonthlyDay: p.payroll_semimonthly_day,
    payrollMonthlyStartDay: p.payroll_monthly_start_day,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required.");
  const host = new URL(connectionString).host;
  console.log(`Target DB host: ${host}`);
  if (APPLY) {
    if (!CONFIRM_HOST || !host.includes(CONFIRM_HOST)) {
      throw new Error(`Refusing to --apply: pass --confirm-host <substr> matching "${host}".`);
    }
  } else {
    console.log("DRY RUN (no writes). Re-run with --apply --confirm-host <substr> to write.\n");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const stats = { entriesTotal: 0, entriesNoProject: 0, entriesMapped: 0, periods: 0, conflicts: 0 };

  try {
    const orgs = await prisma.organizations.findMany({
      select: {
        id: true,
        payroll_period: true,
        payroll_start_weekday: true,
        payroll_anchor_date: true,
        payroll_semimonthly_day: true,
        payroll_monthly_start_day: true,
      },
    });

    for (const org of orgs) {
      const projects = await prisma.projects.findMany({
        where: { organization_id: org.id },
        select: {
          id: true,
          payroll_period_override: true,
          payroll_start_weekday: true,
          payroll_anchor_date: true,
          payroll_semimonthly_day: true,
          payroll_monthly_start_day: true,
        },
      });
      const oRow = orgRow(org);

      for (const project of projects) {
        const cfg = resolveEffectivePayPeriodConfig(oRow, projectRow(project)).config;

        const entries = await prisma.time_entries.findMany({
          where: { organization_id: org.id, project_id: project.id },
          select: {
            id: true,
            employee_profile_id: true,
            entry_date: true,
            timesheet_period: { select: { status: true, submitted_at: true, submitted_by: true, locked_at: true, locked_by: true, rejection_reason: true } },
          },
        });

        // Group entries by (employee, operational-period-start).
        const groups = new Map();
        for (const e of entries) {
          stats.entriesTotal++;
          const period = getPayPeriodForDate(cfg, dateOnly(e.entry_date));
          const key = `${e.employee_profile_id}|${period.start}`;
          if (!groups.has(key)) {
            groups.set(key, { employeeProfileId: e.employee_profile_id, period, entryIds: [], legacy: [] });
          }
          const g = groups.get(key);
          g.entryIds.push(e.id);
          if (e.timesheet_period) g.legacy.push(e.timesheet_period);
        }

        for (const g of groups.values()) {
          // Most-restrictive governing legacy status.
          const governing = g.legacy.reduce((best, cur) => (STATUS_RANK[cur.status] > STATUS_RANK[(best?.status) ?? "open"] ? cur : best), null);
          const statuses = new Set(g.legacy.map((l) => l.status));
          if (statuses.size > 1) stats.conflicts++;
          const status = governing?.status ?? "open";
          stats.periods++;
          stats.entriesMapped += g.entryIds.length;

          console.log(
            `${APPLY ? "WRITE" : "PLAN "} project=${project.id.slice(0, 8)} emp=${g.employeeProfileId.slice(0, 8)} ` +
              `${g.period.start}..${g.period.end} status=${status} entries=${g.entryIds.length}` +
              (statuses.size > 1 ? ` ⚠ mixed legacy statuses: ${[...statuses].join(",")}` : ""),
          );

          if (!APPLY) continue;

          const row = await prisma.project_timesheet_periods.upsert({
            where: {
              employee_profile_id_project_id_period_start_date: {
                employee_profile_id: g.employeeProfileId,
                project_id: project.id,
                period_start_date: dateInput(g.period.start),
              },
            },
            create: {
              organization_id: org.id,
              employee_profile_id: g.employeeProfileId,
              project_id: project.id,
              period_start_date: dateInput(g.period.start),
              period_end_date: dateInput(g.period.end),
              cadence: g.period.cadence,
              status,
              submitted_at: governing?.submitted_at ?? null,
              submitted_by: governing?.submitted_by ?? null,
              locked_at: governing?.locked_at ?? null,
              locked_by: governing?.locked_by ?? null,
              rejection_reason: governing?.rejection_reason ?? null,
            },
            update: {}, // never rewrite an existing operational row
          });

          await prisma.time_entries.updateMany({
            where: { id: { in: g.entryIds } },
            data: { project_period_id: row.id },
          });
        }
      }
    }

    const noProject = await prisma.time_entries.count({ where: { project_id: null } });
    stats.entriesNoProject = noProject;

    console.log("\nSummary:", JSON.stringify(stats, null, 2));
    if (stats.entriesNoProject > 0) {
      console.log(`\n⚠ ${stats.entriesNoProject} entries have no project and were NOT backfilled (decide handling separately).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
