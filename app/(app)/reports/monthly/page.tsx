import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Users, Clock3, Layers, ListChecks } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationReviewer } from "@/lib/tenant/context";
import {
  currentMonthYm,
  getMonthlyReport,
  isCurrentMonth,
  listMonthlyProjectOptions,
  normalizeMonthYm,
  resolveMonth,
  shiftMonth,
} from "@/lib/reports/monthly";
import { Button } from "@/components/ui/button";

type SearchParams = { month?: string; project?: string; employee?: string };

/**
 * MHV-6 monthly team timesheet report — reviewer-scoped calendar-month view.
 *
 * Admins see every entry (including General/no-project); managers see only
 * entries in projects they lead/manage. Totals derive from `time_entries`
 * directly (never a period cache), so switching a project's cadence never
 * skews a monthly total; entries counted at most once by design (source is
 * `time_entries`, not the joined period rows).
 */
export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, organization, membership } = await requireOrganizationReviewer();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");

  const sp = await searchParams;
  const monthYm = normalizeMonthYm(sp.month);
  const month = resolveMonth(monthYm);
  const project = sp.project?.trim() || undefined;
  const employeeSearch = sp.employee?.trim() || undefined;
  const isAdmin = membership.role === "admin";

  const [projects, report] = await Promise.all([
    listMonthlyProjectOptions(viewer, organization.id),
    getMonthlyReport(viewer, organization.id, { month, project, employeeSearch }),
  ]);

  const baseParams = (m: string) => {
    const q = new URLSearchParams({ month: m });
    if (project) q.set("project", project);
    if (employeeSearch) q.set("employee", employeeSearch);
    return q.toString();
  };
  const exportQ = (fmt: "xlsx" | "csv") => {
    const q = new URLSearchParams({ month: month.ym, format: fmt });
    if (project) q.set("project", project);
    if (employeeSearch) q.set("employee", employeeSearch);
    return `/api/reports/monthly-export?${q.toString()}`;
  };

  const onCurrent = isCurrentMonth(month.ym);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Timesheets</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin
              ? "Actual logged hours by employee for the selected calendar month."
              : "Actual logged hours for employees on the projects you manage."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/reports/payroll">
            <Button type="button" variant="outline" size="sm">Payroll Readiness</Button>
          </Link>
          <a href={exportQ("csv")}>
            <Button type="button" variant="outline" size="sm">Export CSV</Button>
          </a>
          <a href={exportQ("xlsx")}>
            <Button type="button" variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export XLSX
            </Button>
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          <Link
            href={`/reports/monthly?${baseParams(shiftMonth(month.ym, -1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            ‹ Prev
          </Link>
          <span className="min-w-[170px] px-3 py-1.5 text-center text-sm font-semibold">{month.label}</span>
          <Link
            href={`/reports/monthly?${baseParams(shiftMonth(month.ym, 1))}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
          >
            Next ›
          </Link>
          {!onCurrent ? (
            <Link href={`/reports/monthly?${baseParams(currentMonthYm())}`}>
              <Button type="button" size="sm" className="ml-1">This Month</Button>
            </Link>
          ) : null}
        </div>

        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Month</span>
            <input
              type="month"
              name="month"
              defaultValue={month.ym}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Project</span>
            <select
              name="project"
              defaultValue={project ?? ""}
              className="h-9 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All projects</option>
              {isAdmin ? <option value="general">General (no project)</option> : null}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            <span className="text-muted-foreground">Employee</span>
            <input
              type="search"
              name="employee"
              placeholder="Name or email"
              defaultValue={employeeSearch ?? ""}
              className="h-9 min-w-[180px] rounded-md border border-border bg-background px-3 text-sm"
            />
          </label>
          <Button type="submit" size="sm">Apply</Button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Employees" value={String(report.summary.employeeCount)} />
        <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Total Hours" value={`${report.summary.totalHours}h`} />
        <SummaryCard icon={<Layers className="h-4 w-4" />} label="Projects" value={String(report.summary.projectCount)} />
        <SummaryCard icon={<ListChecks className="h-4 w-4" />} label="Entries" value={String(report.summary.entryCount)} />
      </div>

      {report.employees.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No time entries logged in {month.label}
          {project ? " for that project" : ""}{employeeSearch ? " matching that search" : ""}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2 text-right font-semibold">Projects</th>
                  <th className="px-4 py-2 text-right font-semibold">Entries</th>
                  <th className="px-4 py-2 text-right font-semibold">Active days</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.employees.map((row) => {
                  const detailQ = new URLSearchParams({ month: month.ym });
                  if (project) detailQ.set("project", project);
                  return (
                    <tr key={row.employeeProfileId} className="hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeEmail}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">{row.totalHours}h</td>
                      <td className="px-4 py-2 text-right">{row.projectCount}</td>
                      <td className="px-4 py-2 text-right">{row.entryCount}</td>
                      <td className="px-4 py-2 text-right">{row.activeDays}</td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/reports/monthly/${row.employeeProfileId}?${detailQ.toString()}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
