import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Users, Clock3, Send, AlertTriangle } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationContext } from "@/lib/tenant/context";
import {
  listReviewFilterProjects,
  listReviewPeriodRows,
  type ReviewFilters,
  type ReviewStatus,
  type WorkflowStatusFilter,
} from "@/lib/timesheets/team-review";
import { todayStr } from "@/lib/timesheets/week";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { formatCutoffForOrg, getCutoffState, getSubmissionCutoff } from "@/lib/pay-periods/cutoff";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: ReviewStatus[] = ["open", "submitted", "approved", "rejected", "locked"];
// MHV-10: "outstanding" is a composite shorthand for open+submitted+rejected.
// See `isOutstandingStatus` — categorization is authoritative in shape helpers.
const STATUS_OPTIONS: { value: WorkflowStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "outstanding", label: "Outstanding (open + submitted + rejected)" },
  { value: "open", label: "Open" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "locked", label: "Locked" },
];

function normalizeStatus(s: string | undefined): WorkflowStatusFilter {
  if (!s || s === "all") return "all";
  if (s === "outstanding") return "outstanding";
  return (STATUSES as string[]).includes(s) ? (s as ReviewStatus) : "all";
}

export default async function TeamReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; project?: string; status?: string; employee?: string }>;
}) {
  const { user, organization, membership } = await requireOrganizationContext();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");

  const sp = await searchParams;
  const referenceDate = sp.ref && DATE_RE.test(sp.ref) ? sp.ref : todayStr();
  const filters: ReviewFilters = {
    referenceDate,
    projectId: sp.project || undefined,
    status: normalizeStatus(sp.status),
    employeeSearch: sp.employee || undefined,
  };

  const [projects, { rows, summary }, org] = await Promise.all([
    listReviewFilterProjects(viewer, organization.id),
    listReviewPeriodRows(viewer, organization.id, filters),
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
  const cutoffForRow = (endDate: string, status: ReviewStatus) => {
    const cutoff = getSubmissionCutoff(endDate, cutoffPolicy, org?.timezone ?? "UTC");
    const state = getCutoffState(now, cutoff, status);
    return { cutoff, state, label: cutoff ? formatCutoffForOrg(cutoff, org?.timezone ?? "UTC") : null };
  };

  const exportHref = buildExportHref(filters);
  const isAdmin = membership.role === "admin";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employee Hours Review</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? "Every project pay period active on the reference date, across your workspace."
              : "Project pay periods you manage on the reference date."}
          </p>
        </div>
        <a href={exportHref}>
          <Button type="button" variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export detail
          </Button>
        </a>
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
            <option value="">
              {isAdmin ? "All projects" : "All my managed projects"}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Status</span>
          <select
            name="status"
            defaultValue={filters.status ?? "all"}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
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
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </label>
      </form>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile icon={Users} label="Visible employees" value={String(summary.visibleEmployees)} />
        <SummaryTile icon={Clock3} label="Total hours" value={`${summary.totalHours}h`} />
        <SummaryTile icon={Send} label="Awaiting review" value={String(summary.submittedCount)} />
        <SummaryTile
          icon={AlertTriangle}
          label="Open / rejected"
          value={String(summary.openCount + summary.rejectedCount)}
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-10 text-center text-sm text-muted-foreground">
            No review items match these filters on {referenceDate}.
          </div>
        ) : (
          rows.map((r) => (
            <Link
              key={r.ref}
              href={`/team/${encodeURIComponent(r.ref)}?ref=${referenceDate}`}
              className="group rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:bg-xqa-sky-soft/40 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight">{r.employeeName}</h2>
                    <span className="text-muted-foreground text-xs">{r.employeeEmail}</span>
                    <span className="text-xqa-blue text-sm font-semibold">· {r.projectName}</span>
                    {r.isGeneral ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Legacy weekly
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {r.periodStart} → {r.periodEnd} · {r.cadence}
                    {(() => {
                      const c = cutoffForRow(r.periodEnd, r.status);
                      if (c.state === "disabled" || c.state === "not_actionable" || !c.label) return null;
                      const tone =
                        c.state === "overdue"
                          ? "text-destructive"
                          : c.state === "due_soon"
                            ? "text-warning"
                            : "text-muted-foreground";
                      const prefix =
                        c.state === "overdue" ? "Overdue — was due " : c.state === "due_soon" ? "Due soon: " : "Due: ";
                      return <span className={`ml-2 text-xs font-medium ${tone}`}>· {prefix}{c.label}</span>;
                    })()}
                  </p>
                  {r.status === "rejected" && r.rejectionReason ? (
                    <p className="text-destructive mt-1 text-xs">
                      Rejection reason: {r.rejectionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lg font-semibold tabular-nums">{r.totalHours}h</span>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
      <span className="bg-xqa-sky-soft text-xqa-blue flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}

function buildExportHref(filters: ReviewFilters): string {
  const params = new URLSearchParams({ ref: filters.referenceDate, format: "xlsx" });
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.employeeSearch) params.set("employee", filters.employeeSearch);
  return `/api/reviews/export?${params.toString()}`;
}
