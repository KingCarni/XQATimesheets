import Link from "next/link";
import { redirect } from "next/navigation";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationContext } from "@/lib/tenant/context";
import { getTeamOverview } from "@/lib/timesheets/team";
import { getWeekRange, todayStr, shiftWeek, weekRangeLabel } from "@/lib/timesheets/week";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { user, organization, membership } = await requireOrganizationContext();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");
  const { week: weekParam } = await searchParams;
  const week = getWeekRange(weekParam && DATE_RE.test(weekParam) ? weekParam : todayStr());
  const weekStart = week.start;
  const rows = await getTeamOverview(viewer, weekStart, organization.id);
  const isCurrentWeek = weekStart === getWeekRange(todayStr()).start;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Timesheets</h1>
          <p className="text-muted-foreground text-sm">Weekly completion for employees in your review scope.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
          <Link
            href={`/team?week=${shiftWeek(weekStart, -1)}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
            aria-label="Previous week"
          >
            ‹ Prev
          </Link>
          <span className="min-w-[190px] px-3 py-1.5 text-center text-sm font-semibold">
            {weekRangeLabel(week)}
          </span>
          <Link
            href={`/team?week=${shiftWeek(weekStart, 1)}`}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-xqa-sky-soft"
            aria-label="Next week"
          >
            Next ›
          </Link>
          {!isCurrentWeek ? (
            <Link href="/team">
              <Button type="button" size="sm" className="ml-1">
                This Week
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Mon</th>
              <th className="px-4 py-3">Tue</th>
              <th className="px-4 py-3">Wed</th>
              <th className="px-4 py-3">Thu</th>
              <th className="px-4 py-3">Fri</th>
              <th className="px-4 py-3">Week</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Projects</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // A submission the reviewer can act on links straight into the
              // Approvals timesheet queue, preselecting this employee + period.
              const linkable = row.periodId && row.status !== "open";
              const href = linkable
                ? `/approvals?tab=timesheets&status=${row.status}&employee=${encodeURIComponent(
                    row.employee,
                  )}&period=${row.periodId}`
                : null;
              return (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{row.employee}</p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  </td>
                  {row.workdays.map((day) => (
                    <td key={day.day} className="px-4 py-3">
                      {day.total}h
                    </td>
                  ))}
                  <td className="px-4 py-3 font-semibold">{row.total}h</td>
                  <td className="px-4 py-3">
                    {href ? (
                      <Link href={href} className="inline-block rounded-full transition hover:opacity-80" title="Review in Approvals">
                        <StatusBadge status={row.status} />
                      </Link>
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.projects.join(", ") || "None"}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No employees are currently in your review scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
