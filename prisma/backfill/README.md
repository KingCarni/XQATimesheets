# MHV-8 follow-up — operational period backfill & historical-data safety

Operational (project-scoped) submission periods (`project_timesheet_periods`) are
**additive**. Existing weekly `timesheet_periods` rows, `time_entries`, and
`approvals` are preserved; the operational migration
(`prisma/migrations/20260919130000_mhv8_operational_project_periods`) only adds a
table, two nullable columns, relaxes two `NOT NULL` constraints, and adds one
enum value. **That migration is the prerequisite for this backfill** — the
original `20260919120000_mhv8_custom_pay_periods` only carries the org/project
cadence columns and the two new `payroll_period` enum values.

## Boundaries are frozen on the row

When an operational period row is first created (lazily, when an entry needs it, or
by this backfill), its `period_start_date` / `period_end_date` are stamped from the
project's **effective config at that moment** and then **never recomputed**
(`update: {}` on every upsert). So changing a project's pay-period config later:

| Period state | Effect of a later config change |
|---|---|
| **submitted / approved / locked** | **Immutable.** Boundaries stay; entries stay pointed at it. The new config only affects *future* period discovery. |
| **open / rejected** | Re-resolves to the current config. Because identity is `period_start_date`, a changed config yields a *different* row; open entries are re-pointed to it (no silent orphaning — every entry always resolves to *some* current-config period). |

This split is unit-tested in `lib/pay-periods/operational.test.ts` (cases 16 / 16b)
and enforced at write time by `isPeriodEditable` (`types/domain.ts`).

## Backfill script

`prisma/backfill/mhv8-operational-periods.mjs` derives operational rows from real
entries (never from invented project assignments):

- **Dry-run by default** — prints a plan, writes nothing.
- `--apply --confirm-host <substr>` to write; refuses unless the target host
  matches, as a guard against the wrong database.
- **Idempotent** (upsert on `(employee, project, period_start)`).
- Entries **without a project** are counted and skipped — never forced into one.
- A derived period inherits the **most restrictive** legacy status among the weekly
  periods whose entries fall into it (locked > approved > submitted > rejected >
  open), copying the governing period's `submitted_*` / `locked_*` /
  `rejection_reason`. Mixed-status collapses are reported with ⚠ for human review.

```bash
# Disposable Neon branch with BOTH MHV-8 migrations applied
# (20260919120000_mhv8_custom_pay_periods AND
#  20260919130000_mhv8_operational_project_periods):
export PATH="/c/Program Files/nodejs:$PATH"
node prisma/backfill/mhv8-operational-periods.mjs                       # dry run
node prisma/backfill/mhv8-operational-periods.mjs --apply --confirm-host ep-  # write
```

**NEVER run against shared/prod Neon.** Not run as part of `prisma migrate`.

## Not yet done (step 2 — wiring)

The schema, resolver (`lib/pay-periods/operational.ts`), pure mapping
(`resolveOperationalPeriod`), tests, and this backfill are in place. Still to wire:
entry create/edit/autosave → `ensureOperationalPeriodForEntry`; per-project
submission/approval/reject/lock mutations; My Timesheet grouping UI + per-project
navigation; approvals queue by operational period; reports/PTO/import touch-points.
