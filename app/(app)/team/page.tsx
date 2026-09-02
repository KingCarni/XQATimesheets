import { redirect } from "next/navigation";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/session";
import { getTeamOverview } from "@/lib/timesheets/team";
import { getWeekRange, todayStr, shiftWeek } from "@/lib/timesheets/week";
import { Button } from "@/components/ui/button";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  if (!(await hasReviewScope(user))) redirect("/my-timesheet");
  const { week: weekParam } = await searchParams;
  const weekStart = getWeekRange(weekParam && DATE_RE.test(weekParam) ? weekParam : todayStr()).start;
  const rows = await getTeamOverview(user, weekStart);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Timesheets</h1>
          <p className="text-muted-foreground text-sm">Weekly completion for employees in your review scope.</p>
        </div>
        <div className="flex gap-2">
          <a href={`/team?week=${shiftWeek(weekStart, -1)}`}>
            <Button type="button" variant="outline" size="sm">Prev</Button>
          </a>
          <a href="/team">
            <Button type="button" size="sm">Today</Button>
          </a>
          <a href={`/team?week=${shiftWeek(weekStart, 1)}`}>
            <Button type="button" variant="outline" size="sm">Next</Button>
          </a>
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
            {rows.map((row) => (
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
                <td className="px-4 py-3 capitalize">{row.status}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.projects.join(", ") || "None"}</td>
              </tr>
            ))}
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
