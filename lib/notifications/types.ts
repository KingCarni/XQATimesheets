/**
 * MHV-3 notification event catalog. Producer functions accept these types;
 * delivery channels (email, push, in-app) will consume them uniformly later.
 * NEW types append to this union — do not renumber.
 */
export type NotificationType =
  | "timesheet_submitted"
  | "timesheet_approved"
  | "timesheet_rejected"
  | "cutoff_due_soon"
  | "cutoff_overdue"
  | "payroll_action"
  | "timesheet_reminder"
  | "contract_expiring"
  | "contract_expired"
  | "system";

export type CreateNotificationInput = {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Deterministic dedupe key. Repeated inserts with the same
   * (organizationId, userId, dedupeKey) tuple are silently dropped (per
   * the partial unique index on `notifications`). Omit for one-off events.
   */
  dedupeKey?: string | null;
};

export type NotificationRow = {
  id: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  href: string | null;
  metadata: Record<string, unknown> | null;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Pure helper — build the dedupe key for the recurring cutoff sweep. Keeping
 * it here (not in cutoff-sweep.ts) so tests can pin format without touching
 * the DB.
 */
export function cutoffDedupeKey(kind: "cutoff_due_soon" | "cutoff_overdue", periodRef: string): string {
  return `${kind}:${periodRef}`;
}

/**
 * MHV-13 dedupe key for contract-expiry notifications. One key per (contract,
 * event kind) — repeated sweep runs never create duplicates. Because there is
 * exactly one `expired` moment per contract, the `contract_expired` key does
 * not need a date suffix; `contract_expiring` re-fires only if the contract
 * end date is changed to a new value AND the caller varies the key (V1 keeps
 * it strictly one warning per contract).
 */
export function contractDedupeKey(
  kind: "contract_expiring" | "contract_expired",
  contractId: string,
): string {
  return `${kind}:${contractId}`;
}
