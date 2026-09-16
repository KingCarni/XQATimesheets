-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('upcoming', 'active', 'expired', 'terminated');

-- CreateEnum
CREATE TYPE "equipment_status" AS ENUM ('assigned', 'returned', 'retired');

-- CreateEnum
CREATE TYPE "hardware_request_status" AS ENUM ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_entity_type" ADD VALUE 'employee_contract';
ALTER TYPE "audit_entity_type" ADD VALUE 'contract_attachment';
ALTER TYPE "audit_entity_type" ADD VALUE 'equipment_assignment';
ALTER TYPE "audit_entity_type" ADD VALUE 'hardware_request';
ALTER TYPE "audit_entity_type" ADD VALUE 'leave_entitlement';

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "contract_type" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "contract_status" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "file_bytes" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_user_id" UUID,

    CONSTRAINT "contract_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "asset_tag" TEXT,
    "status" "equipment_status" NOT NULL DEFAULT 'assigned',
    "issued_on" DATE,
    "returned_on" DATE,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hardware_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "details" TEXT NOT NULL,
    "category" TEXT,
    "status" "hardware_request_status" NOT NULL DEFAULT 'requested',
    "review_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hardware_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_profile_id" UUID NOT NULL,
    "activity_type_id" UUID NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_contracts_employee" ON "employee_contracts"("employee_profile_id", "start_date");

-- CreateIndex
CREATE INDEX "idx_contract_attachments_contract" ON "contract_attachments"("contract_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "idx_equipment_employee" ON "equipment_assignments"("employee_profile_id", "status");

-- CreateIndex
CREATE INDEX "idx_hardware_requests_employee" ON "hardware_requests"("employee_profile_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_hardware_requests_status" ON "hardware_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leave_entitlements_employee_profile_id_activity_type_id_key" ON "leave_entitlements"("employee_profile_id", "activity_type_id");

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "employee_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_assignments" ADD CONSTRAINT "equipment_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_requests" ADD CONSTRAINT "hardware_requests_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_requests" ADD CONSTRAINT "hardware_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hardware_requests" ADD CONSTRAINT "hardware_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
