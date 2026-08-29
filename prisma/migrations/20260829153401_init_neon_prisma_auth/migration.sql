CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('employee', 'manager', 'admin');

-- CreateEnum
CREATE TYPE "assignment_role" AS ENUM ('member', 'lead', 'manager');

-- CreateEnum
CREATE TYPE "timesheet_status" AS ENUM ('open', 'submitted', 'approved', 'rejected', 'locked');

-- CreateEnum
CREATE TYPE "approval_action" AS ENUM ('submit', 'approve', 'reject', 'reopen', 'lock');

-- CreateEnum
CREATE TYPE "pto_status" AS ENUM ('requested', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "audit_entity_type" AS ENUM ('user', 'employee_profile', 'project', 'project_assignment', 'platform', 'activity_type', 'time_entry', 'timesheet_period', 'approval', 'pto_request');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "app_role" NOT NULL DEFAULT 'employee',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "employee_code" TEXT,
    "full_name" TEXT NOT NULL,
    "manager_user_id" UUID,
    "default_daily_hours" DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    "department" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Vancouver',
    "start_date" DATE,
    "end_date" DATE,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "client_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_platform" BOOLEAN NOT NULL DEFAULT false,
    "color_token" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platforms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "is_pto" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "assignment_role" "assignment_role" NOT NULL DEFAULT 'member',
    "starts_on" DATE,
    "ends_on" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "project_id" UUID,
    "platform_id" UUID,
    "activity_type_id" UUID NOT NULL,
    "description" TEXT,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "week_start_date" DATE NOT NULL,
    "week_end_date" DATE NOT NULL,
    "expected_hours" DECIMAL(5,2) NOT NULL,
    "total_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "timesheet_status" NOT NULL DEFAULT 'open',
    "submitted_at" TIMESTAMPTZ(6),
    "submitted_by" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" UUID,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "timesheet_period_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "project_id" UUID,
    "platform_id" UUID,
    "activity_type_id" UUID NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "time_entries"
  ADD CONSTRAINT "time_entries_hours_check" CHECK ("hours" > 0 AND "hours" <= 24);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "timesheet_period_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "approval_action" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" "audit_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_state" JSONB,
    "after_state" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "activity_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    "total_hours" DECIMAL(5,2) NOT NULL,
    "status" "pto_status" NOT NULL DEFAULT 'requested',
    "notes" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pto_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pto_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "pto_type" TEXT NOT NULL,
    "balance_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pto_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_user_id_key" ON "employee_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_employee_profiles_manager" ON "employee_profiles"("manager_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_name_key" ON "platforms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "activity_types_name_key" ON "activity_types"("name");

-- CreateIndex
CREATE INDEX "idx_assignments_project" ON "project_assignments"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_employee_profile_id_project_id_key" ON "project_assignments"("employee_profile_id", "project_id");

-- CreateIndex
CREATE INDEX "idx_templates_employee" ON "entry_templates"("employee_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_periods_employee_profile_id_week_start_date_key" ON "timesheet_periods"("employee_profile_id", "week_start_date");

-- CreateIndex
CREATE INDEX "idx_time_entries_employee_date" ON "time_entries"("employee_profile_id", "entry_date");

-- CreateIndex
CREATE INDEX "idx_time_entries_project_date" ON "time_entries"("project_id", "entry_date");

-- CreateIndex
CREATE INDEX "idx_time_entries_period" ON "time_entries"("timesheet_period_id");

-- CreateIndex
CREATE INDEX "idx_approvals_period" ON "approvals"("timesheet_period_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_history"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_pto_requests_employee" ON "pto_requests"("employee_profile_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "pto_balances_employee_profile_id_pto_type_effective_date_key" ON "pto_balances"("employee_profile_id", "pto_type", "effective_date");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_templates" ADD CONSTRAINT "entry_templates_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_templates" ADD CONSTRAINT "entry_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_templates" ADD CONSTRAINT "entry_templates_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_templates" ADD CONSTRAINT "entry_templates_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_history" ADD CONSTRAINT "audit_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.recalc_period_total(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE timesheet_periods tp
  SET total_hours = COALESCE(
    (SELECT SUM(te.hours) FROM time_entries te WHERE te.timesheet_period_id = p_period_id),
    0
  )
  WHERE tp.id = p_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.time_entries_maintain_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.recalc_period_total(OLD.timesheet_period_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_period_total(NEW.timesheet_period_id);
  IF (TG_OP = 'UPDATE' AND NEW.timesheet_period_id <> OLD.timesheet_period_id) THEN
    PERFORM public.recalc_period_total(OLD.timesheet_period_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_time_entries_total
  AFTER INSERT OR UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_maintain_total();
