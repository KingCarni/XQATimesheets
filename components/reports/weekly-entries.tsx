import { ChevronRight } from "lucide-react";

import { getWeekRange, weekRangeLabel } from "@/lib/timesheets/week";
import { StatusBadge } from "@/components/shared/status-badge";

export type WeeklyEntryRow = {
  id: string;
  date: string;
  employee: string;
  project?: string;
  platform: string;
  workType: string;
  hours: number;
  status: string;
  description: string;
};

type WeekGroup = {
  weekStart: string;
  label: string;
  rows: WeeklyEntryRow[];
  totalHours: number;
  employeeCount: number;
  projectCount: number;
};

function groupByWeek(rows: WeeklyEntryRow[]): WeekGroup[] {
  const groups = new Map<string, WeeklyEntryRow[]>();
  for (const row of rows) {
    const weekStart = getWeekRange(row.date).start;
    const list = groups.get(weekStart);
    if (list) list.push(row);
    else groups.set(weekStart, [row]);
  }

  return [...groups.entries()]
    .map(([weekStart, weekRows]) => {
      const week = getWeekRange(weekStart);
      return {
        weekStart,
        label: weekRangeLabel(week),
        rows: weekRows,
        totalHours: Math.round(weekRows.reduce((sum, r) => sum + r.hours, 0) * 100) / 100,
        employeeCount: new Set(weekRows.map((r) => r.employee)).size,
        projectCount: new Set(weekRows.map((r) => r.project).filter(Boolean)).size,
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/**
 * Time entries as collapsed weekly sections: a summary header per week
 * (range, hours, employees, projects) that expands to the detailed rows.
 * Summary first, details on demand — no giant flat table.
 */
export function WeeklyEntries({
  rows,
  showProject = true,
  openFirst = false,
}: {
  rows: WeeklyEntryRow[];
  showProject?: boolean;
  openFirst?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No time entries in the selected period.
      </div>
    );
  }

  const groups = groupByWeek(rows);

  return (
    <div className="grid gap-3">
      {groups.map((group, index) => (
        <details
          key={group.weekStart}
          open={openFirst && index === 0}
          className="group rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-muted/40">
            <div className="flex items-center gap-3">
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-open:rotate-90" />
              <div>
                <p className="font-semibold">{group.label}</p>
                <p className="text-xs text-muted-foreground">
                  {group.totalHours}h · {group.employeeCount} employee{group.employeeCount === 1 ? "" : "s"}
                  {showProject
                    ? ` · ${group.projectCount} project${group.projectCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">{group.totalHours}h</span>
          </summary>

          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Employee</th>
                  {showProject ? <th className="px-4 py-2.5">Project</th> : null}
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5">Work Type</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Description</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-2.5 font-medium">{row.employee}</td>
                    {showProject ? <td className="px-4 py-2.5">{row.project ?? "None"}</td> : null}
                    <td className="px-4 py-2.5 text-muted-foreground">{row.platform}</td>
                    <td className="px-4 py-2.5">{row.workType}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.hours}h</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      <span className="line-clamp-2 max-w-[280px]" title={row.description}>
                        {row.description || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}
