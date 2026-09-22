import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, Download, Send, Users, UserCog } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationContext } from "@/lib/tenant/context";
import {
  listPayrollRows,
  listReviewFilterProjects,
  type ReviewFilters,
  type WorkflowStatusFilter,
} from "@/lib/timesheets/team-review";
import { prisma } from "@/lib/prisma";
import { formatCutoffForOrg, getCutoffState, getSubmissionCutoff } from "@/lib/pay-periods/cutoff";
import type { ReviewStatus } from "@/lib/timesheets/team-review-shape";
import {
  categorizePayrollReadiness,
  derivePayrollActionItem,
  PAYROLL_READINESS_LABELS,
  summarizePayrollRows,
  type PayrollReadiness,
} from "@/lib/timesheets/team-review-shape";
import { todayStr } from "@/lib/timesheets/week";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const READINESS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "ready", label: "Ready (approved + locked)" },
  { value: "awaiting_review", label: "Awaiting review (submitted)" },
  { value: "employee_action", label: "Employee action (open + rejected)" },
];

const READINESS_STYLES: Record<PayrollReadiness, string> = {
  ready: "bg-success/15 text-success",
  awaiting_review: "bg-warning/15 text-warning",
  employee_action: "bg-destructive/15 text-destructive",
};

/**
 * MHV-5 payroll-readiness report. Reuses the reviewer-scoped list from
 * MHV-2/9 (`listPayrollRows` is a thin alias over `listReviewPeriodRows`) and
 * categorizes each row into Ready / Awaiting review / Employee action via the
 * pure `categorizePayrollReadiness`. No new persisted model, no cutoff/late
 * logic (MHV-4 owns that later). Reviewer authorization + tenant isolation are
 * enforced by the underlying query.
 */
export default async function PayrollReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; project?: string; readiness?: string; employee?: string }>;
}) {
  const { user, organization, membership } = await requireOrganizationContext();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");

  const sp = await searchParams;
  const referenceDate = sp.ref && DATE_RE.test(sp.ref) ? sp.ref : todayStr();
  // The readiness filter (Ready / Awaiting review / Employee action) is
  // client-visible only — the DB query stays "all statuses" and we filter
  // in-memory because readiness is a pure derivation over status.
  const readinessFilter =
    sp.readiness && READINESS_FILTER_OPTIONS.some((o) => o.value === sp.readiness)
      ? (sp.readiness as PayrollReadiness | "all")
      : "all";
  const filters: ReviewFilters = {
    referenceDate,
    projectId: sp.project || undefined,
    status: "all" as WorkflowStatusFilter,
    employeeSearch: sp.employee || undefined,
  };

  const [projects, { rows: allRows }, org] = await Promise.all([
    listReviewFilterProjects(viewer, organization.id),
    listPayrollRows(viewer, organization.id, filters),
    prisma.organizations.findUnique({
      where: { id: organization.id },
      select: {
        timezone: true,
        submission_cutoff_enabled: true,
        submission_cutoff_offset_days: true,
        submission_cutoff_time: true,
      },
    }),
  ]);
  const now = new Date();
  const cutoffPolicy = {
    enabled: org?.submission_cutoff_enabled ?? false,
    offsetDays: org?.submission_cutoff_offset_days ?? null,
    timeLocal: org?.submission_cutoff_time ?? null,
  };
  const cutoffFor = (endDate: string, status: ReviewStatus) => {
    const cutoff = getSubmissionCutoff(endDate, cutoffPolicy, org?.timezone ?? "UTC");
    const state = getCutoffState(now, cutoff, status);
    return { state, label: cutoff && state !== "disabled" && state !== "not_actionable" ? formatCutoffForOrg(cutoff, org?.timezone ?? "UTC") : null };
  };
  const rows = readinessFilter === "all"
    ? allRows
    : allRows.filter((r) => categorizePayrollReadiness(r.status) === readinessFilter);
  const summary = summarizePayrollRows(rows);

  const exportHref = (() => {
    const params = new URLSearchParams({ ref: referenceDate, format: "xlsx" });
    if (filters.projectId) params.set("project", filters.projectId);
    if (readinessFilter !== "all") params.set("readiness", readinessFilter);
    if (filters.employeeSearch) params.set("employee", filters.employeeSearch);
    return `/api/reviews/payroll-export?${params.toString()}`;
  })();

  const isAdmin = membership.role === "admin";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll Readiness</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? "Every project pay period on the reference date, grouped by payroll readiness."
              : "Payroll readiness for the pay periods you manage on the reference date."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/team">
            <Button type="button" variant="outline" size="sm">Hours Review</Button>
          </Link>
          <a href={exportHref}>
            <Button type="button" variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export payroll
            </Button>
          </a>
        </div>
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Reference date</span>
          <input
            type="date"
            name="ref"
            defaultValue={referenceDate}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Project</span>
          <select
            name="project"
            defaultValue={filters.projectId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">{isAdmin ? "All projects" : "All my managed projects"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Readiness</span>
          <select
            name="readiness"
            defaultValue={readinessFilter}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {READINESS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Employee (name / email)</span>
          <div className="flex gap-2">
            <input
              type="text"
              name="employee"
              defaultValue={filters.employeeSearch ?? ""}
              placeholder="Search…"
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button type="submit" size="sm">Apply</Button>
          </div>
        </label>
      </form>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile icon={Users} label="Visible employees" value={String(summary.visibleEmployees)} />
        <SummaryTile icon={Clock3} label="Total hours" value={`${summary.totalHours}h`} />
        <SummaryTile icon={CheckCircle2} label="Ready periods" value={String(summary.readyCount)} tone="success" />
        <SummaryTile icon={Send} label="Awaiting review" value={String(summary.awaitingReviewCount)} tone="warning" />
        <SummaryTile icon={UserCog} label="Needs employee action" value={String(summary.employeeActionCount)} tone="destructive" />
      </div>

      {/* Payroll table */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3 text-right">Hours</th>
              <th className="px-4 py-3">Workflow</th>
              <th className="px-4 py-3">Readiness</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No payroll rows match these filters on {referenceDate}.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const readiness = categorizePayrollReadiness(r.status);
                const action = derivePayrollActionItem(r);
                return (
                  <tr key={r.ref} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{r.employeeEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.projectName}
                      {r.isGeneral ? (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Legacy weekly
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.periodStart} → {r.periodEnd}
                      {(() => {
                        const c = cutoffFor(r.periodEnd, r.status);
                        if (!c.label) return null;
                        const tone =
                          c.state === "overdue"
                            ? "text-destructive"
                            : c.state === "due_soon"
                              ? "text-warning"
                              : "text-muted-foreground";
                        const prefix = c.state === "overdue" ? "Overdue: " : c.state === "due_soon" ? "Due soon: " : "Due: ";
                        return <div className={`text-xs font-medium ${tone}`}>{prefix}{c.label}</div>;
                      })()}
                    </td>
                    <td className="px-4 py-3">{r.cadence}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.totalHours}h</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${READINESS_STYLES[readiness]}`}>
                        {PAYROLL_READINESS_LABELS[readiness]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {action.actionType === "none" ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <Link
                          href={action.href}
                          className="text-xqa-blue text-sm font-semibold hover:underline"
                        >
                          {actionLabel(action.actionType)} →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function actionLabel(actionType: "employee_submit" | "reviewer_approve" | "employee_correct" | "none"): string {
  switch (actionType) {
    case "employee_submit":
      return "View";
    case "reviewer_approve":
      return "Review in Approvals";
    case "employee_correct":
      return "View rejection";
    case "none":
      return "";
  }
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone = "brand",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "brand" | "success" | "warning" | "destructive";
}) {
  const tones: Record<string, string> = {
    brand: "bg-xqa-sky-soft text-xqa-blue",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
      <span className={`${tones[tone]} flex h-11 w-11 shrink-0 items-center justify-center rounded-full`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}
