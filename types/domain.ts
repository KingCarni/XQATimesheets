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
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** A period is read-only for the employee once it reaches these states. */
export const LOCKED_TIMESHEET_STATUSES: readonly TimesheetStatus[] = ["approved", "locked"];

export function isPeriodEditable(status: TimesheetStatus): boolean {
  return !LOCKED_TIMESHEET_STATUSES.includes(status);
}
