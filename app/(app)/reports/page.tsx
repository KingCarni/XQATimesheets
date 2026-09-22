import Link from "next/link";

import { requireOrganizationReviewer } from "@/lib/tenant/context";
import type { ReportFilters, ReportStatusPreset } from "@/lib/reports/queries";
import {
  getHoursByActivityType,
  getHoursByEmployee,
  getHoursByPlatform,
  getHoursByProject,
  getHoursByPtoType,
  getReportFilterOptions,
  getReportRows,
  getReportSummary,
  REPORT_STATUS_PRESETS,
} from "@/lib/reports/queries";
import {
  currentAnchor,
  isCurrentPeriod,
  normalizeAnchor,
  normalizePeriodType,
  resolvePeriod,
  shiftPeriodAnchor,
} from "@/lib/reports/period";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarList } from "@/components/charts/bar-list";
import { WeeklyEntries } from "@/components/reports/weekly-entries";

const STATUS_LABELS: Record<ReportStatusPreset, string> = {
  approved: "Approved only",
  approved_and_submitted: "Approved + Submitted",
  all: "All statuses",
};

type SearchParams = {
  period?: string;
  anchor?: string;
  employee?: string;
  project?: string;
  platform?: string;
  activity?: string;
  status?: string;
};

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user, organization, membership } = await requireOrganizationReviewer();
  const viewer = { ...user, role: membership.role };
  const params = await searchParams;

  const periodType = normalizePeriodType(params.period);
  const anchor = normalizeAnchor(params.anchor);
  const period = resolvePeriod(periodType, anchor);
  // Week-first view defaults to all logged hours so the current week isn't
  // empty before approvals happen; the selector still narrows to approved.
  const statusPreset = (params.status && params.status in REPORT_STATUS_PRESETS ? params.status : "all") as ReportStatusPreset;

  const filters: ReportFilters = {
    organizationId: organization.id,
    start: period.start,
    end: period.end,
    employeeId: params.employee || undefined,
    projectId: params.project || undefined,
    platformId: params.platform || undefined,
    activityTypeId: params.activity || undefined,
    status: statusPreset,
  };

  const [options, summary, byProject, byEmployee, byPlatform, byActivity, byPto, detail] = await Promise.all([
    getReportFilterOptions(viewer, organization.id),
    getReportSummary(viewer, filters),
    getHoursByProject(viewer, filters),
    getHoursByEmployee(viewer, filters),
    getHoursByPlatform(viewer, filters),
    getHoursByActivityType(viewer, filters),
    getHoursByPtoType(viewer, filters),
    getReportRows(viewer, filters, {}),
  ]);

  const nonBillableHours = Math.max(0, Math.round((summary.totalHours - summary.billableHours) * 100) / 100);

  // Preserve filters + period across navigation; only the anchor changes.
  const baseParams = (anchorValue: string) => {
    const q = new URLSearchParams();
    q.set("period", periodType);
    q.set("anchor", anchorValue);
    if (params.employee) q.set("employee", params.employee);
    if (params.project) q.set("project", params.project);
    if (params.platform) q.set("platform", params.platform);
    if (params.activity) q.set("activity", params.activity);
    if (params.status) q.set("status", params.status);
    return q.toString();
  };

  const exportQuery = baseParams(anchor);
  const onCurrent = isCurrentPeriod(periodType, anchor);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm">
            {user.role === "admin"
              ? "Organization-wide time reporting."
              : "Time reporting for employees and projects in your review scope."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/projects">
            <Button type="button" variant="outline" size="sm">
              Project report →
            </Button>
          </Link>
          <Link href="/reports/monthly">
            <Button type="button" variant="outline" size="sm">
              Monthly timesheets →
            </Button>
          </Link>
          <Link href="/reports/payroll">
            <Button type="button" variant="outline" size="sm">
              Payroll readiness →
            </Button>
          </Link>
          {user.role === "admin" ? (
            <>
              <Link href="/reports/equipment">
                <Button type="button" variant="outline" size="sm">
                  Equipment inventory →
                </Button>
              </Link>
              <Link href="/reports/contracts">
                <Button type="button" variant="outline" size="sm">
                  Contracts →
                </Button>
              </Link>
            </>
          ) : null}
          <a href={`/api/reports/export?${exportQuery}&format=csv`}>
            <Button type="button" variant="outline" size="sm">
              Export CSV
            </Button>
          </a>
          <a href={`/api/reports/export?${exportQuery}&format=xlsx`}>
            <Button type="button" variant="outline" size="sm">
              Export XLSX
            </Button>
          </a>
        </div>
      </div>

      {/* Week-first period controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          <Link
            href={`/reports?${baseParams(shiftPeriodAnchor(periodType, anchor, -1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            ‹ Prev
          </Link>
          <span className="min-w-[190px] px-3 py-1.5 text-center text-sm font-semibold">{period.label}</span>
          <Link
            href={`/reports?${baseParams(shiftPeriodAnchor(periodType, anchor, 1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            Next ›
          </Link>
          {!onCurrent ? (
            <Link href={`/reports?${baseParams(currentAnchor())}`}>
              <Button type="button" size="sm" className="ml-1">
                This Week
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Filters (period mode + scope) */}
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="anchor" value={anchor} />
          <Select name="period" defaultValue={periodType} aria-label="Period mode" className="w-32">
            <option value="weekly">Week</option>
            <option value="biweekly">Biweekly</option>
          </Select>
          <Select name="employee" defaultValue={params.employee ?? ""} aria-label="Employee" className="w-40">
            <option value="">All employees</option>
            {options.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select name="project" defaultValue={params.project ?? ""} aria-label="Project" className="w-36">
            <option value="">All projects</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="platform" defaultValue={params.platform ?? ""} aria-label="Platform" className="w-32">
            <option value="">All platforms</option>
            {options.platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="activity" defaultValue={params.activity ?? ""} aria-label="Work type" className="w-36">
            <option value="">All work types</option>
            {options.activityTypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={statusPreset} aria-label="Status" className="w-44">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Hours" value={`${summary.totalHours}h`} />
        <SummaryCard label="Billable Hours" value={`${summary.billableHours}h`} />
        <SummaryCard label="PTO Hours" value={`${summary.ptoHours}h`} />
        <SummaryCard label="Employees" value={String(summary.employeeCount)} />
        <SummaryCard label="Projects" value={String(summary.projectCount)} />
      </div>

      <div className="grid gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics</p>

        <CollapsibleSection title="Hours by Project" subtitle="Share of logged hours across projects">
          <DonutChart data={byProject.map((r) => ({ label: r.label, value: r.hours }))} />
        </CollapsibleSection>

        <CollapsibleSection title="Hours by Work Type" subtitle="Share of hours by activity / work type">
          <DonutChart data={byActivity.map((r) => ({ label: r.label, value: r.hours }))} />
        </CollapsibleSection>

        <CollapsibleSection title="Billable vs Non-Billable" subtitle="Proportion of billable time">
          <DonutChart
            data={[
              { label: "Billable", value: summary.billableHours, color: "#059669" },
              { label: "Non-billable", value: nonBillableHours, color: "#64748b" },
            ]}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Hours by Employee" subtitle="Comparison across employees">
          <BarList data={byEmployee.map((r) => ({ id: r.id, label: r.label, value: r.hours }))} colorize />
        </CollapsibleSection>

        <CollapsibleSection title="Hours by Platform" subtitle="Comparison across platforms">
          <BarList data={byPlatform.map((r) => ({ id: r.id, label: r.label, value: r.hours }))} colorize />
        </CollapsibleSection>

        {byPto.length > 0 ? (
          <CollapsibleSection title="Time Off Summary" subtitle="Approved-status hours by time-off type">
            <DonutChart data={byPto.map((r) => ({ label: r.label, value: r.hours }))} />
          </CollapsibleSection>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Time Entries</h2>
          <p className="text-xs text-muted-foreground">Grouped by week — expand a week for details.</p>
        </div>
        <WeeklyEntries
          rows={detail.rows.map((r) => ({
            id: r.id,
            date: r.date,
            employee: r.employee,
            project: r.project,
            platform: r.platform,
            workType: r.workType,
            hours: r.hours,
            status: r.status,
            description: r.description,
          }))}
          openFirst={periodType === "weekly"}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
    </div>
  );
}
