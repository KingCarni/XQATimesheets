import { requireRole } from "@/lib/auth/session";
import { parseReportFilters, type ReportSearchParams } from "@/lib/reports/filters";
import {
  getHoursByActivityType,
  getHoursByEmployee,
  getHoursByPlatform,
  getHoursByProject,
  getHoursByWeek,
  getReportFilterOptions,
  getReportRows,
  getReportSummary,
  REPORT_STATUS_PRESETS,
} from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { HoursBreakdownRow } from "@/lib/reports/queries";

const ROW_LIMIT = 200;

const STATUS_LABELS: Record<keyof typeof REPORT_STATUS_PRESETS, string> = {
  approved: "Approved only",
  approved_and_submitted: "Approved + Submitted",
  all: "All statuses",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>;
}) {
  const user = await requireRole("manager", "admin");
  const params = await searchParams;
  const filters = parseReportFilters(params);

  const [options, summary, byProject, byEmployee, byPlatform, byActivity, byWeek, detail] = await Promise.all([
    getReportFilterOptions(user),
    getReportSummary(user, filters),
    getHoursByProject(user, filters),
    getHoursByEmployee(user, filters),
    getHoursByPlatform(user, filters),
    getHoursByActivityType(user, filters),
    getHoursByWeek(user, filters),
    getReportRows(user, filters, { limit: ROW_LIMIT }),
  ]);

  const exportQuery = new URLSearchParams();
  if (params.start) exportQuery.set("start", params.start);
  if (params.end) exportQuery.set("end", params.end);
  if (params.employee) exportQuery.set("employee", params.employee);
  if (params.project) exportQuery.set("project", params.project);
  if (params.platform) exportQuery.set("platform", params.platform);
  if (params.activity) exportQuery.set("activity", params.activity);
  if (params.status) exportQuery.set("status", params.status);
  const exportBase = `/api/reports/export?${exportQuery.toString()}`;

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
          <a href={`${exportBase}&format=csv`}>
            <Button type="button" variant="outline" size="sm">
              Export CSV
            </Button>
          </a>
          <a href={`${exportBase}&format=xlsx`}>
            <Button type="button" variant="outline" size="sm">
              Export XLSX
            </Button>
          </a>
        </div>
      </div>

      <form className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:grid-cols-3 lg:grid-cols-7">
        <Input type="date" name="start" defaultValue={params.start ?? ""} aria-label="Start date" />
        <Input type="date" name="end" defaultValue={params.end ?? ""} aria-label="End date" />
        <Select name="employee" defaultValue={params.employee ?? ""}>
          <option value="">All employees</option>
          {options.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <Select name="project" defaultValue={params.project ?? ""}>
          <option value="">All projects</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="platform" defaultValue={params.platform ?? ""}>
          <option value="">All platforms</option>
          {options.platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="activity" defaultValue={params.activity ?? ""}>
          <option value="">All work types</option>
          {options.activityTypes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? "approved"}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit" className="lg:col-span-7">
          Apply Filters
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Hours" value={`${summary.totalHours}h`} />
        <SummaryCard label="Billable Hours" value={`${summary.billableHours}h`} />
        <SummaryCard label="PTO Hours" value={`${summary.ptoHours}h`} />
        <SummaryCard label="Employees" value={String(summary.employeeCount)} />
        <SummaryCard label="Projects" value={String(summary.projectCount)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BreakdownCard title="Hours by Project" rows={byProject} />
        <BreakdownCard title="Hours by Employee" rows={byEmployee} />
        <BreakdownCard title="Hours by Platform" rows={byPlatform} />
        <BreakdownCard title="Hours by Work Type" rows={byActivity} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 text-lg font-semibold">Hours by Week</h2>
        {byWeek.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hours in the selected range.</p>
        ) : (
          <div className="grid gap-2">
            {byWeek.map((w) => (
              <div key={w.weekStart} className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0">
                <span className="text-muted-foreground">{w.weekStart}</span>
                <span className="font-semibold">{w.hours}h</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">Time Entries</h2>
          {detail.truncated ? (
            <p className="text-xs text-muted-foreground">
              Showing the first {ROW_LIMIT} rows on screen — exports include every matching row.
            </p>
          ) : null}
        </div>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Work Type</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3 font-semibold">{row.employee}</td>
                <td className="px-4 py-3">{row.project}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.platform}</td>
                <td className="px-4 py-3">{row.workType}</td>
                <td className="px-4 py-3">{row.hours}h</td>
                <td className="px-4 py-3 capitalize">{row.status}</td>
              </tr>
            ))}
            {detail.rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                  No time entries match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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

function BreakdownCard({ title, rows }: { title: string; rows: HoursBreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.hours));
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hours in the selected range.</p>
      ) : (
        <div className="grid gap-2">
          {rows.slice(0, 12).map((row) => (
            <div key={row.id} className="grid gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{row.label}</span>
                <span className="font-semibold">{row.hours}h</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="from-xqa-blue to-xqa-blue-2 h-1.5 rounded-full bg-gradient-to-r"
                  style={{ width: `${Math.max(4, (row.hours / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
