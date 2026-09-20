-- MHV-8 Custom pay periods — organization-level payroll/reporting cadence.
-- Additive & non-destructive: new enum values + nullable columns only. Existing
-- organizations are untouched and keep the weekly fallback (payroll_period IS NULL).
--
-- Enum values are added first and are NOT used in this migration (only added),
-- so this is safe to apply with `prisma migrate deploy`.

-- 1) Extend the payroll cadence enum with the two new V1 cadences.
ALTER TYPE "payroll_period" ADD VALUE IF NOT EXISTS 'semimonthly';
ALTER TYPE "payroll_period" ADD VALUE IF NOT EXISTS 'monthly';

-- 2) Organization-level payroll configuration columns (all nullable; the
--    application resolves sensible defaults when they are NULL).
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "payroll_start_weekday"     INTEGER,
  ADD COLUMN IF NOT EXISTS "payroll_anchor_date"       DATE,
  ADD COLUMN IF NOT EXISTS "payroll_semimonthly_day"   INTEGER,
  ADD COLUMN IF NOT EXISTS "payroll_monthly_start_day" INTEGER;

-- 3) Optional per-project payroll override (MHV-8 follow-up). All nullable;
--    a NULL "payroll_period_override" means the project inherits the org config.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "payroll_period_override"   "payroll_period",
  ADD COLUMN IF NOT EXISTS "payroll_start_weekday"     INTEGER,
  ADD COLUMN IF NOT EXISTS "payroll_anchor_date"       DATE,
  ADD COLUMN IF NOT EXISTS "payroll_semimonthly_day"   INTEGER,
  ADD COLUMN IF NOT EXISTS "payroll_monthly_start_day" INTEGER;
