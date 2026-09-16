/**
 * Domain-level enums and value types.
 *
 * These mirror the Postgres enums defined in `prisma/schema.prisma`.
 * Keep the two in sync.
 */

export const APP_ROLES = ["employee", "manager", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ASSIGNMENT_ROLES = ["member", "lead", "manager"] as const;
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];

export const TIMESHEET_STATUSES = [
  "open",
  "submitted",
  "approved",
  "rejected",
  "locked",
] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const APPROVAL_ACTIONS = ["submit", "approve", "reject", "reopen", "lock"] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const PTO_STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;
export type PtoStatus = (typeof PTO_STATUSES)[number];

export const CONTRACT_STATUSES = ["upcoming", "active", "expired", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const EQUIPMENT_STATUSES = ["assigned", "returned", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const PAYROLL_PERIODS = ["weekly", "biweekly"] as const;
export type PayrollPeriod = (typeof PAYROLL_PERIODS)[number];

export const ORGANIZATION_DOMAIN_TYPES = ["subdomain", "custom"] as const;
export type OrganizationDomainType = (typeof ORGANIZATION_DOMAIN_TYPES)[number];

export const HARDWARE_REQUEST_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "fulfilled",
  "cancelled",
] as const;
export type HardwareRequestStatus = (typeof HARDWARE_REQUEST_STATUSES)[number];

/** Max length of a free-text hardware request. Shared by client + server. */
export const HARDWARE_REQUEST_MAX_LENGTH = 500;

export const AUDIT_ENTITY_TYPES = [
  "user",
  "employee_profile",
  "project",
  "project_assignment",
  "platform",
  "activity_type",
  "time_entry",
  "timesheet_period",
  "approval",
  "pto_request",
  "employee_contract",
  "contract_attachment",
  "equipment_assignment",
  "hardware_request",
  "leave_entitlement",
  "organization",
  "organization_member",
  "organization_branding",
  "organization_domain",
  "invitation",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** A period is read-only for the employee once it reaches these states. */
export const LOCKED_TIMESHEET_STATUSES: readonly TimesheetStatus[] = [
  "submitted",
  "approved",
  "locked",
];

export function isPeriodEditable(status: TimesheetStatus): boolean {
  return !LOCKED_TIMESHEET_STATUSES.includes(status);
}
