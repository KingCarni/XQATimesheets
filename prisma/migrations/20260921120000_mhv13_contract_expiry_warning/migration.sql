-- MHV-13
-- Additive: organization-level configurable warning window for contract
-- expiry. Contract notes and multi-contract history already exist in the
-- `employee_contracts` model (see the workforce migration). MHV-7 requires
-- no schema change — the existing `equipment_assignments` model already
-- carries assignment history via one row per assignment.

ALTER TABLE "organizations"
  ADD COLUMN "contract_expiry_warning_days" smallint;

-- 0..365 keeps the warning within one calendar year; NULL disables warnings
-- for the tenant. Enforced in the DB so an application bug can't persist a
-- nonsense value.
ALTER TABLE "organizations"
  ADD CONSTRAINT "chk_org_contract_warning_range"
    CHECK ("contract_expiry_warning_days" IS NULL
           OR ("contract_expiry_warning_days" >= 0
               AND "contract_expiry_warning_days" <= 365));
