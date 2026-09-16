-- ===========================================================================
-- HourOps multi-tenant foundation — EXPAND phase (additive, non-destructive).
--
-- This migration:
--   1. Adds the organization/tenant tables.
--   2. Adds a NULLABLE `organization_id` to every organization-owned table.
--   3. Backfills all existing rows into a single "XQA" organization.
--   4. Re-scopes project/platform/activity-type uniqueness from GLOBAL to
--      per-organization.
--
-- It does NOT set organization_id NOT NULL and does NOT add cross-tenant
-- composite foreign keys — those belong to a follow-up CONTRACT-phase migration
-- that runs only after all application writes populate organization_id.
--
-- Review notes / potential failure points before applying:
--   * The `projects_organization_id_name_key` unique (step 6) will FAIL if the
--     existing XQA data contains two projects with the same name. Verify with:
--       SELECT name, count(*) FROM projects GROUP BY name HAVING count(*) > 1;
--     Resolve duplicates before applying, or drop that constraint from step 6.
--   * The fixed XQA organization id below is deterministic and documented.
-- ===========================================================================

-- The deterministic id for the migrated XQA organization.
--   XQA org id = '11111111-1111-4111-8111-111111111111'

-- 1. New enums --------------------------------------------------------------
CREATE TYPE "payroll_period" AS ENUM ('weekly', 'biweekly');
CREATE TYPE "organization_domain_type" AS ENUM ('subdomain', 'custom');

-- Additive enum values (not used within this migration, safe on PostgreSQL 12+).
ALTER TYPE "audit_entity_type" ADD VALUE 'organization';
ALTER TYPE "audit_entity_type" ADD VALUE 'organization_member';
ALTER TYPE "audit_entity_type" ADD VALUE 'organization_branding';
ALTER TYPE "audit_entity_type" ADD VALUE 'organization_domain';
ALTER TYPE "audit_entity_type" ADD VALUE 'invitation';

-- 2. Organization tables ----------------------------------------------------
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Vancouver',
    "week_start" INTEGER NOT NULL DEFAULT 1,
    "payroll_period" "payroll_period",
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" TEXT NOT NULL DEFAULT 'company',
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "app_role" NOT NULL DEFAULT 'employee',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX "idx_org_members_user" ON "organization_members"("user_id");

CREATE TABLE "organization_branding" (
    "organization_id" UUID NOT NULL,
    "primary_color" TEXT,
    "accent_color" TEXT,
    "logo_mime" TEXT,
    "logo_bytes" BYTEA,
    "logo_updated_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_branding_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "organization_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "type" "organization_domain_type" NOT NULL DEFAULT 'subdomain',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),
    CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_domains_hostname_key" ON "organization_domains"("hostname");
CREATE INDEX "idx_org_domains_org" ON "organization_domains"("organization_id");

CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "app_role" NOT NULL DEFAULT 'employee',
    "employee_profile_id" UUID,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "idx_invitations_org" ON "invitations"("organization_id");
CREATE INDEX "idx_invitations_email" ON "invitations"("email");

-- Organization-table foreign keys
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_branding" ADD CONSTRAINT "organization_branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_domains" ADD CONSTRAINT "organization_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Add nullable organization_id to owned tables (+ index + FK) -------------
ALTER TABLE "employee_profiles" ADD COLUMN "organization_id" UUID;
ALTER TABLE "projects" ADD COLUMN "organization_id" UUID;
ALTER TABLE "platforms" ADD COLUMN "organization_id" UUID;
ALTER TABLE "activity_types" ADD COLUMN "organization_id" UUID;
ALTER TABLE "project_assignments" ADD COLUMN "organization_id" UUID;
ALTER TABLE "entry_templates" ADD COLUMN "organization_id" UUID;
ALTER TABLE "timesheet_periods" ADD COLUMN "organization_id" UUID;
ALTER TABLE "time_entries" ADD COLUMN "organization_id" UUID;
ALTER TABLE "approvals" ADD COLUMN "organization_id" UUID;
ALTER TABLE "audit_history" ADD COLUMN "organization_id" UUID;
ALTER TABLE "pto_requests" ADD COLUMN "organization_id" UUID;
ALTER TABLE "pto_balances" ADD COLUMN "organization_id" UUID;
ALTER TABLE "employee_contracts" ADD COLUMN "organization_id" UUID;
ALTER TABLE "contract_attachments" ADD COLUMN "organization_id" UUID;
ALTER TABLE "equipment_assignments" ADD COLUMN "organization_id" UUID;
ALTER TABLE "hardware_requests" ADD COLUMN "organization_id" UUID;
ALTER TABLE "leave_entitlements" ADD COLUMN "organization_id" UUID;

CREATE INDEX "idx_employee_profiles_org" ON "employee_profiles"("organization_id");
CREATE INDEX "idx_projects_org" ON "projects"("organization_id");
CREATE INDEX "idx_platforms_org" ON "platforms"("organization_id");
CREATE INDEX "idx_activity_types_org" ON "activity_types"("organization_id");
CREATE INDEX "idx_assignments_org" ON "project_assignments"("organization_id");
CREATE INDEX "idx_templates_org" ON "entry_templates"("organization_id");
CREATE INDEX "idx_periods_org" ON "timesheet_periods"("organization_id");
CREATE INDEX "idx_time_entries_org_date" ON "time_entries"("organization_id", "entry_date");
CREATE INDEX "idx_approvals_org" ON "approvals"("organization_id");
CREATE INDEX "idx_audit_org" ON "audit_history"("organization_id", "occurred_at");
CREATE INDEX "idx_pto_requests_org" ON "pto_requests"("organization_id");
CREATE INDEX "idx_pto_balances_org" ON "pto_balances"("organization_id");
CREATE INDEX "idx_contracts_org" ON "employee_contracts"("organization_id");
CREATE INDEX "idx_contract_attachments_org" ON "contract_attachments"("organization_id");
CREATE INDEX "idx_equipment_org" ON "equipment_assignments"("organization_id");
CREATE INDEX "idx_hardware_requests_org" ON "hardware_requests"("organization_id");
CREATE INDEX "idx_leave_entitlements_org" ON "leave_entitlements"("organization_id");

ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "entry_templates" ADD CONSTRAINT "entry_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_history" ADD CONSTRAINT "audit_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hardware_requests" ADD CONSTRAINT "hardware_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Backfill: place ALL existing data into the XQA organization -------------
INSERT INTO "organizations" ("id", "name", "slug", "timezone", "week_start", "is_demo", "onboarding_step", "onboarding_completed_at", "created_at", "updated_at")
VALUES ('11111111-1111-4111-8111-111111111111', 'XQA', 'xqa', 'America/Vancouver', 1, false, 'finish', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "organization_branding" ("organization_id", "primary_color", "accent_color", "updated_at")
VALUES ('11111111-1111-4111-8111-111111111111', '#127fc4', '#07111a', CURRENT_TIMESTAMP);

INSERT INTO "organization_domains" ("id", "organization_id", "hostname", "type", "verified", "is_primary", "created_at", "verified_at")
VALUES (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'xqa.hourops.ca', 'subdomain', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Every existing user becomes an XQA member, preserving their current global role.
INSERT INTO "organization_members" ("id", "organization_id", "user_id", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), '11111111-1111-4111-8111-111111111111', "id", "role", "is_active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users";

-- Every existing owned row belongs to XQA (this is currently a single-tenant DB).
UPDATE "employee_profiles"     SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "projects"              SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "platforms"             SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "activity_types"        SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "project_assignments"   SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "entry_templates"       SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "timesheet_periods"     SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "time_entries"          SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "approvals"             SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "audit_history"         SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "pto_requests"          SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "pto_balances"          SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "employee_contracts"    SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "contract_attachments"  SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "equipment_assignments" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "hardware_requests"     SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "leave_entitlements"    SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;

-- 5. Re-scope uniqueness from GLOBAL to per-organization ---------------------
-- Drop the old global unique indexes.
DROP INDEX "projects_code_key";
DROP INDEX "platforms_name_key";
DROP INDEX "activity_types_name_key";

-- Composite-unique targets for future contract-phase cross-tenant FKs.
CREATE UNIQUE INDEX "employee_profiles_id_organization_id_key" ON "employee_profiles"("id", "organization_id");
CREATE UNIQUE INDEX "projects_id_organization_id_key" ON "projects"("id", "organization_id");

-- Per-organization uniqueness.
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");
CREATE UNIQUE INDEX "projects_organization_id_name_key" ON "projects"("organization_id", "name");
CREATE UNIQUE INDEX "platforms_organization_id_name_key" ON "platforms"("organization_id", "name");
CREATE UNIQUE INDEX "activity_types_organization_id_name_key" ON "activity_types"("organization_id", "name");
