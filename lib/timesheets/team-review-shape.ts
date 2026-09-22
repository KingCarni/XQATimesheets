/**
 * MHV-2 / MHV-9 — pure shaping + filtering for the Employee Hours Review
 * workspace.
 *
 * This file holds ONLY pure data-transform helpers so they can be exercised
 * with `node --test` without touching Prisma. The DB layer in
 * `team-review.ts` fetches rows in the shape below and delegates every
 * filter/sort/summary decision here, which means the exact rules the reviewer
 * sees on-screen are what the unit tests pin down.
 *
 * Design notes:
 *   - The workspace groups by (employee × project × operational period).
 *     Two projects belonging to the same employee are two independent rows —
 *     never collapsed together.
 *   - Reference date drives which operational period is shown for each
 *     project. This mirrors My Timesheet's per-project Prev/Current/Next.
 *   - General (no-project) time is a separate, admin-only row kind. It is
 *     never surfaced to a project-scoped manager (they have no project
 *     anchor for it).
 *   - Reviewer scope is enforced by the DB layer BEFORE rows reach here; the
 *     shape layer just filters/orders what it is given.
 */

export type ReviewStatus = "open" | "submitted" | "approved" | "rejected" | "locked";

/** One reviewable unit: an employee + project + operational pay period. */
export type ReviewPeriodRow = {
  /** Composite ref used in routes/exports (e.g. "project:<uuid>"). */
  ref: string;
  employeeProfileId: string;
  employeeName: string;
  employeeEmail: string;
  projectId: string | null; // null → General bucket
  projectName: string;
  cadence: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  status: ReviewStatus;
  submittedAt: string | null;
  rejectionReason: string | null;
  /** True when this row is the legacy General weekly bucket (admin only). */
  isGeneral: boolean;
};

/**
 * The status filter accepts every workflow status plus two composite tokens:
 *   - "all"         — every status (default when unset).
 *   - "outstanding" — MHV-10 shorthand for anything blocking payroll:
 *                     open + submitted + rejected. Approved/Locked are ready and
 *                     never included in Outstanding. See `isOutstandingStatus`.
 */
export type WorkflowStatusFilter = ReviewStatus | "all" | "outstanding";

export type ReviewFilters = {
  referenceDate: string; // yyyy-MM-dd
  projectId?: string; // null / undefined → all authorized projects
  status?: WorkflowStatusFilter;
  employeeSearch?: string;
};

const OUTSTANDING_STATUSES: readonly ReviewStatus[] = ["open", "submitted", "rejected"];

/** Whether a workflow status blocks payroll — MHV-10 "Outstanding" semantics. */
export function isOutstandingStatus(status: ReviewStatus): boolean {
  return (OUTSTANDING_STATUSES as readonly string[]).includes(status);
}

export type ReviewSummary = {
  visibleEmployees: number;
  totalHours: number;
  submittedCount: number;
  openCount: number;
  rejectedCount: number;
};

const STATUS_RANK: Record<ReviewStatus, number> = {
  submitted: 0, // Awaiting review is most actionable
  rejected: 1,
  open: 2,
  approved: 3,
  locked: 4,
};

/**
 * Apply client-side filters to a set of pre-authorized rows and sort them so
 * the most actionable items come first. Reference-date containment is applied
 * FIRST because a row from a persisted operational period may span a range
 * that the current reference date is not inside — we only show rows for the
 * period that CONTAINS the reference date.
 */
export function filterReviewRows(
  rows: readonly ReviewPeriodRow[],
  filters: ReviewFilters,
): ReviewPeriodRow[] {
  const ref = filters.referenceDate;
  const search = (filters.employeeSearch ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (ref && !(r.periodStart <= ref && ref <= r.periodEnd)) return false;
    if (filters.projectId && r.projectId !== filters.projectId) return false;
    if (filters.status && filters.status !== "all") {
      if (filters.status === "outstanding") {
        if (!isOutstandingStatus(r.status)) return false;
      } else if (r.status !== filters.status) {
        return false;
      }
    }
    if (search) {
      const hay = `${r.employeeName} ${r.employeeEmail}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  filtered.sort((a, b) => {
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s !== 0) return s;
    const t = (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
    if (t !== 0) return t;
    return a.employeeName.localeCompare(b.employeeName);
  });
  return filtered;
}

/** Top-of-page metrics. All counts are over the filtered result set. */
export function summarizeReviewRows(rows: readonly ReviewPeriodRow[]): ReviewSummary {
  const employees = new Set<string>();
  let total = 0;
  let submitted = 0;
  let open = 0;
  let rejected = 0;
  for (const r of rows) {
    employees.add(r.employeeProfileId);
    total += r.totalHours;
    if (r.status === "submitted") submitted++;
    else if (r.status === "open") open++;
    else if (r.status === "rejected") rejected++;
  }
  return {
    visibleEmployees: employees.size,
    totalHours: Math.round(total * 100) / 100,
    submittedCount: submitted,
    openCount: open,
    rejectedCount: rejected,
  };
}

/** One row per source time entry, in the flat shape used by CSV/XLSX export. */
export type ReviewExportRow = {
  employee: string;
  employeeEmail: string;
  project: string;
  periodStart: string;
  periodEnd: string;
  cadence: string;
  status: ReviewStatus;
  entryDate: string;
  hours: number;
  workType: string;
  platform: string;
  description: string;
  submittedAt: string;
  rejectionReason: string;
};

/**
 * Filename for the review export. Includes the reference date and, when a
 * project filter is applied, the project slug — so downloaded files are
 * self-describing on disk. Never leaks a tenant slug across orgs (the caller
 * passes the current org's slug).
 */
export function buildExportFilename(params: {
  orgSlug: string;
  referenceDate: string;
  projectSlug?: string;
  format: "csv" | "xlsx";
  variant?: "hours-review" | "payroll";
}): string {
  const scope = params.projectSlug ? `-${params.projectSlug}` : "";
  const variant = params.variant ?? "hours-review";
  return `${params.orgSlug}-${variant}${scope}-${params.referenceDate}.${params.format}`;
}

// ---------------------------------------------------------------------------
// MHV-5 — payroll readiness. Pure derivations over ReviewPeriodRow so the same
// row that powers /team also powers /reports/payroll without a duplicate model.
//
// IMPORTANT: this is workflow-state readiness only. It does NOT encode any
// cutoff, deadline, or "late" logic — MHV-4 owns cutoffs and this file must
// not invent them. When MHV-4 arrives, it will layer a separate cutoff field
// on top of readiness; nothing here needs to know about it yet.
// ---------------------------------------------------------------------------

/**
 * Payroll-readiness categories, disjoint and exhaustive over ReviewStatus.
 *   - "ready"            → Approved OR Locked
 *   - "awaiting_review"  → Submitted (reviewer must act)
 *   - "employee_action"  → Open OR Rejected (employee must act)
 * Deliberately excludes any Late/Overdue category — see MHV-4.
 */
export type PayrollReadiness = "ready" | "awaiting_review" | "employee_action";

export function categorizePayrollReadiness(status: ReviewStatus): PayrollReadiness {
  switch (status) {
    case "approved":
    case "locked":
      return "ready";
    case "submitted":
      return "awaiting_review";
    case "open":
    case "rejected":
      return "employee_action";
  }
}

export const PAYROLL_READINESS_LABELS: Record<PayrollReadiness, string> = {
  ready: "Ready",
  awaiting_review: "Awaiting review",
  employee_action: "Employee action",
};

export type PayrollSummary = {
  visibleEmployees: number;
  totalHours: number;
  readyCount: number;
  awaitingReviewCount: number;
  employeeActionCount: number;
};

/** Precise counts by readiness category. No target/expected hours. */
export function summarizePayrollRows(rows: readonly ReviewPeriodRow[]): PayrollSummary {
  const employees = new Set<string>();
  let total = 0;
  let ready = 0;
  let awaiting = 0;
  let action = 0;
  for (const r of rows) {
    employees.add(r.employeeProfileId);
    total += r.totalHours;
    const cat = categorizePayrollReadiness(r.status);
    if (cat === "ready") ready++;
    else if (cat === "awaiting_review") awaiting++;
    else action++;
  }
  return {
    visibleEmployees: employees.size,
    totalHours: Math.round(total * 100) / 100,
    readyCount: ready,
    awaitingReviewCount: awaiting,
    employeeActionCount: action,
  };
}

/**
 * Derived action item — the "what does this row need next?" that MHV-3 will
 * later consume when it wires up reminder delivery. Pure over the row so no
 * DB call is needed. NOT persisted; recomputed on every render/export.
 */
export type PayrollActionType =
  | "employee_submit"
  | "reviewer_approve"
  | "employee_correct"
  | "none";

export type PayrollActionItem = {
  periodRef: string;
  employeeProfileId: string;
  employeeName: string;
  projectId: string | null;
  projectName: string;
  status: ReviewStatus;
  actionType: PayrollActionType;
  href: string;
};

function actionTypeFor(status: ReviewStatus): PayrollActionType {
  switch (status) {
    case "open":
      return "employee_submit";
    case "submitted":
      return "reviewer_approve";
    case "rejected":
      return "employee_correct";
    case "approved":
    case "locked":
      return "none";
  }
}

/**
 * Build the reviewer-facing href for a row. Submitted rows deep-link into the
 * existing Approvals queue (no new mutation surface); everything else opens
 * the detail view. Never fabricates a URL for another tenant — the ref is
 * already tenant-scoped by the DB layer that produced the row.
 */
function hrefFor(row: ReviewPeriodRow): string {
  const ref = encodeURIComponent(row.ref);
  if (row.status === "submitted" || row.status === "rejected") {
    return `/approvals?tab=timesheets&period=${ref}`;
  }
  return `/team/${ref}`;
}

export function derivePayrollActionItem(row: ReviewPeriodRow): PayrollActionItem {
  return {
    periodRef: row.ref,
    employeeProfileId: row.employeeProfileId,
    employeeName: row.employeeName,
    projectId: row.projectId,
    projectName: row.projectName,
    status: row.status,
    actionType: actionTypeFor(row.status),
    href: hrefFor(row),
  };
}

/** One row per employee/project-period in the payroll export. */
export type PayrollExportRow = {
  employee: string;
  employeeEmail: string;
  project: string;
  periodStart: string;
  periodEnd: string;
  cadence: string;
  totalHours: number;
  status: ReviewStatus;
  readiness: PayrollReadiness;
  readinessLabel: string;
  submittedAt: string;
  rejectionReason: string;
};

/**
 * Payroll export rows preserve BOTH the workflow status and the derived
 * readiness label so a payroll operator can filter/pivot on either without
 * losing information. Never mutates the underlying rows.
 */
export function buildPayrollExportRows(rows: readonly ReviewPeriodRow[]): PayrollExportRow[] {
  return rows.map((r) => {
    const readiness = categorizePayrollReadiness(r.status);
    return {
      employee: r.employeeName,
      employeeEmail: r.employeeEmail,
      project: r.projectName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      cadence: r.cadence,
      totalHours: r.totalHours,
      status: r.status,
      readiness,
      readinessLabel: PAYROLL_READINESS_LABELS[readiness],
      submittedAt: r.submittedAt ?? "",
      rejectionReason: r.rejectionReason ?? "",
    };
  });
}
