import Link from "next/link";

import { requireOrganizationReviewer } from "@/lib/tenant/context";
import { REPORT_STATUS_PRESETS, type ReportStatusPreset } from "@/lib/reports/queries";
import {
  getProjectReport,
  getScopedProjects,
  resolveProjectPeriod,
  type ProjectPeriodType,
} from "@/lib/reports/project-report";
import {
  currentAnchor,
  isCurrentPeriod,
  normalizeAnchor,
  normalizePeriodType,
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

export default async function ProjectReportPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; period?: string; anchor?: string; status?: string }>;
}) {
  const { user, organization, membership } = await requireOrganizationReviewer();
  const viewer = { ...user, role: membership.role };
  const params = await searchParams;

  const projects = await getScopedProjects(viewer, organization.id);
  const projectId = params.project ?? projects[0]?.id ?? "";
  const periodType: ProjectPeriodType = normalizePeriodType(params.period);
  const anchor = normalizeAnchor(params.anchor);
  const statusPreset = (params.status && params.status in REPORT_STATUS_PRESETS ? params.status : "all") as ReportStatusPreset;
  const period = resolveProjectPeriod(periodType, anchor);

  const report = projectId
    ? await getProjectReport(viewer, { projectId, period, statusPreset, organizationId: organization.id })
    : null;

  // Preserve project + period + status across week navigation.
  const baseParams = (anchorValue: string) => {
    const q = new URLSearchParams();
    if (projectId) q.set("project", projectId);
    q.set("period", periodType);
    q.set("anchor", anchorValue);
    q.set("status", statusPreset);
    return q.toString();
  };
  const exportQuery = baseParams(anchor);
  const onCurrent = isCurrentPeriod(periodType, anchor);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project Report</h1>
          <p className="text-muted-foreground text-sm">Where a project&apos;s time went over a week or two-week period.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports">
            <Button type="button" variant="outline" size="sm">
              ← All reports
            </Button>
          </Link>
          {report ? (
            <>
              <a href={`/api/reports/project-export?${exportQuery}&format=xlsx`}>
                <Button type="button" variant="outline" size="sm">
                  Export XLSX
                </Button>
              </a>
              <a href={`/api/reports/project-export?${exportQuery}&format=csv`}>
                <Button type="button" variant="outline" size="sm">
                  Export CSV
                </Button>
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          <Link
            href={`/reports/projects?${baseParams(shiftPeriodAnchor(periodType, anchor, -1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            ‹ Prev
          </Link>
          <span className="min-w-[190px] px-3 py-1.5 text-center text-sm font-semibold">{period.label}</span>
          <Link
            href={`/reports/projects?${baseParams(shiftPeriodAnchor(periodType, anchor, 1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            Next ›
          </Link>
          {!onCurrent ? (
            <Link href={`/reports/projects?${baseParams(currentAnchor())}`}>
              <Button type="button" size="sm" className="ml-1">
                This Week
              </Button>
            </Link>
          ) : null}
        </div>

        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="anchor" value={anchor} />
          <Select name="project" defaultValue={projectId} aria-label="Project" className="w-44">
            {projects.length === 0 ? <option value="">No projects in scope</option> : null}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="period" defaultValue={periodType} aria-label="Period mode" className="w-32">
            <option value="weekly">Week</option>
            <option value="biweekly">Biweekly</option>
          </Select>
          <Select name="status" defaultValue={statusPreset} aria-label="Status" className="w-44">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Run
          </Button>
        </form>
      </div>

      {!report ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          {projects.length === 0
            ? "You don't have any projects in your review scope."
            : "Select a project and period, then run the report."}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{report.project.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {report.period.type === "weekly" ? "Week" : "Biweekly period"}: {report.period.start} → {report.period.end}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Total Hours" value={`${report.totalHours}h`} />
            <Metric label="Approved Hours" value={`${report.approvedHours}h`} />
            <Metric label="Billable Hours" value={`${report.billableHours}h`} />
            <Metric label="Non-Billable" value={`${report.nonBillableHours}h`} />
            <Metric label="Employees" value={String(report.employeeCount)} />
          </div>

          {report.totalHours === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              No time was logged on this project in the selected period.
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project analytics</p>

                <CollapsibleSection title="Employee share of hours" subtitle="Who contributed to this project" defaultOpen>
                  <DonutChart data={report.byEmployee.map((r) => ({ label: r.label, value: r.hours }))} />
                </CollapsibleSection>

                <CollapsibleSection title="Testing / activity mix" subtitle="Hours by work type">
                  <DonutChart data={report.byActivity.map((r) => ({ label: r.label, value: r.hours }))} />
                </CollapsibleSection>

                <CollapsibleSection title="Billable vs Non-Billable">
                  <DonutChart
                    data={[
                      { label: "Billable", value: report.billableHours, color: "#059669" },
                      { label: "Non-billable", value: report.nonBillableHours, color: "#64748b" },
                    ]}
                  />
                </CollapsibleSection>

                <CollapsibleSection title="Hours by platform">
                  <BarList data={report.byPlatform.map((r) => ({ id: r.id, label: r.label, value: r.hours }))} colorize />
                </CollapsibleSection>
              </div>

              <div className="grid gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">By employee</p>
                {report.employees.map((emp) => (
                  <CollapsibleSection key={emp.id} title={emp.name} subtitle={`${emp.totalHours}h logged`}>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-semibold">Work type</p>
                        <BarList data={emp.byActivity.map((r) => ({ id: r.id, label: r.label, value: r.hours }))} colorize />
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-semibold">Platform</p>
                        <BarList data={emp.byPlatform.map((r) => ({ id: r.id, label: r.label, value: r.hours }))} />
                      </div>
                      <div className="lg:col-span-2">
                        <p className="mb-2 text-sm font-semibold">Daily</p>
                        <BarList data={emp.daily.map((d) => ({ id: d.date, label: d.date, value: d.hours }))} limit={14} />
                      </div>
                    </div>
                  </CollapsibleSection>
                ))}
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Detailed entries</h2>
                  <p className="text-xs text-muted-foreground">Grouped by week — expand a week for details.</p>
                </div>
                <WeeklyEntries
                  rows={report.detail.map((row) => ({
                    id: row.id,
                    date: row.date,
                    employee: row.employee,
                    platform: row.platform,
                    workType: row.workType,
                    hours: row.hours,
                    status: row.status,
                    description: row.description,
                  }))}
                  showProject={false}
                  openFirst={periodType === "weekly"}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
    </div>
  );
}
