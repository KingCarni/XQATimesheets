-- MHV-8 follow-up: operational project-scoped submission periods.
--
-- This migration is a SEPARATE, additive delta authored AFTER the original
-- MHV-8 migration (20260919120000_mhv8_custom_pay_periods) was already applied
-- to the shared database. Migration history is immutable once applied, so the
-- operational schema changes live here rather than being folded back into
-- 20260919120000.
--
-- Additive & non-destructive. NO existing row is altered, dropped, or deleted:
--   * a new audit enum value (added, not yet used),
--   * a new table `project_timesheet_periods` (workflow/state metadata only —
--     it stores NO hours; time_entries stay the single source of hour data),
--   * two new NULLABLE columns on `time_entries` / `approvals`, and
--   * relaxing `time_entries.timesheet_period_id` / `approvals.timesheet_period_id`
--     from NOT NULL to NULL (DROP NOT NULL keeps every existing value intact).
--
-- Existing weekly rows keep working untouched. Historical backfill of operational
-- rows is a SEPARATE, explicit script (see prisma/backfill/*), never run here and
-- never applied to shared/prod Neon.

-- 1) New audit entity type for the operational period (added only, not used here).
ALTER TYPE "audit_entity_type" ADD VALUE IF NOT EXISTS 'project_timesheet_period';

-- 2) The operational submission unit: employee + project + effective pay period.
CREATE TABLE IF NOT EXISTS "project_timesheet_periods" (
  "id"                  UUID             NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"     UUID             NOT NULL,
  "employee_profile_id" UUID             NOT NULL,
  "project_id"          UUID             NOT NULL,
  "period_start_date"   DATE             NOT NULL,
  "period_end_date"     DATE             NOT NULL,
  "cadence"             "payroll_period" NOT NULL,
  "status"              "timesheet_status" NOT NULL DEFAULT 'open',
  "submitted_at"        TIMESTAMPTZ(6),
  "submitted_by"        UUID,
  "locked_at"           TIMESTAMPTZ(6),
  "locked_by"           UUID,
  "rejection_reason"    TEXT,
  "created_at"          TIMESTAMPTZ(6)   NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6)   NOT NULL DEFAULT now(),
  CONSTRAINT "project_timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- One workflow row per (employee, project, period start). Overlapping ranges
-- across DIFFERENT projects are valid because project_id differs.
CREATE UNIQUE INDEX IF NOT EXISTS "project_timesheet_periods_employee_profile_id_project_id_per_key"
  ON "project_timesheet_periods" ("employee_profile_id", "project_id", "period_start_date");
CREATE INDEX IF NOT EXISTS "idx_project_periods_org_status"
  ON "project_timesheet_periods" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "idx_project_periods_project"
  ON "project_timesheet_periods" ("project_id", "period_start_date");
CREATE INDEX IF NOT EXISTS "idx_project_periods_employee"
  ON "project_timesheet_periods" ("employee_profile_id", "period_start_date");

ALTER TABLE "project_timesheet_periods"
  ADD CONSTRAINT "project_timesheet_periods_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_timesheet_periods_employee_profile_id_fkey"
    FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles" ("id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_timesheet_periods_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_timesheet_periods_submitted_by_fkey"
    FOREIGN KEY ("submitted_by") REFERENCES "users" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "project_timesheet_periods_locked_by_fkey"
    FOREIGN KEY ("locked_by") REFERENCES "users" ("id") ON DELETE SET NULL;

-- 3) Point time_entries at the operational period; relax the legacy weekly FK.
ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "project_period_id" UUID;
ALTER TABLE "time_entries"
  ALTER COLUMN "timesheet_period_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_time_entries_project_period"
  ON "time_entries" ("project_period_id");
ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_project_period_id_fkey"
    FOREIGN KEY ("project_period_id") REFERENCES "project_timesheet_periods" ("id") ON DELETE SET NULL;

-- 4) Approvals can reference either a legacy weekly period or an operational one.
ALTER TABLE "approvals"
  ADD COLUMN IF NOT EXISTS "project_period_id" UUID;
ALTER TABLE "approvals"
  ALTER COLUMN "timesheet_period_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_approvals_project_period"
  ON "approvals" ("project_period_id", "created_at");
ALTER TABLE "approvals"
  ADD CONSTRAINT "approvals_project_period_id_fkey"
    FOREIGN KEY ("project_period_id") REFERENCES "project_timesheet_periods" ("id") ON DELETE CASCADE;
