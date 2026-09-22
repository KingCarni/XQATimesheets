import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationReviewer } from "@/lib/tenant/context";
import {
  getMonthlyEmployeeDetail,
  normalizeMonthYm,
  resolveMonth,
} from "@/lib/reports/monthly";
import { Button } from "@/components/ui/button";

type SearchParams = { month?: string; project?: string };
type Params = { profileId: string };

/**
 * Employee drill-down for MHV-6. The underlying query composes the same
 * reviewer scope as the list page, then restricts to this employee — so a
 * manager cannot open the URL for an employee whose visible-hours-in-scope
 * are zero (the query returns nothing → 404). Admin sees every entry the
 * employee logged; manager sees only entries on projects they manage.
 */
export default async function MonthlyEmployeeDrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { user, organization, membership } = await requireOrganizationReviewer();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");

  const { profileId } = await params;
  const sp = await searchParams;
  const monthYm = normalizeMonthYm(sp.month);
  const month = resolveMonth(monthYm);
  const project = sp.project?.trim() || undefined;

  const detail = await getMonthlyEmployeeDetail(viewer, organization.id, profileId, { month, project });
  if (!detail) notFound();

  const backQ = new URLSearchParams({ month: month.ym });
  if (project) backQ.set("project", project);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/reports/monthly?${backQ.toString()}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" /> Back to Monthly Timesheets
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{detail.employee.name}</h1>
          <p className="text-muted-foreground text-sm">
            {detail.employee.email} · {month.label} · {detail.totalHours}h · {detail.entryCount} entries
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="By project" rows={detail.projects} />
        <Breakdown title="By work type" rows={detail.activities} />
        <Breakdown title="By platform" rows={detail.platforms} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Weekly breakdown
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Week</th>
                <th className="px-3 py-2 text-left font-semibold">In {month.label}</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
                <th className="px-3 py-2 text-right font-semibold">Entries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.weeks.map((w) => {
                const partial = w.clippedStart !== w.weekStart || w.clippedEnd !== w.weekEnd;
                return (
                  <tr key={w.weekStart}>
                    <td className="px-3 py-2 font-medium">
                      {w.weekStart} → {w.weekEnd}
                      {partial ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">partial</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {w.clippedStart} → {w.clippedEnd}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{w.hours}h</td>
                    <td className="px-3 py-2 text-right">{w.entryCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Entries ({detail.entries.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Project</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
                <th className="px-3 py-2 text-left font-semibold">Work type</th>
                <th className="px-3 py-2 text-left font-semibold">Platform</th>
                <th className="px-3 py-2 text-left font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.entries.map((e) => (
                <tr key={e.entryId}>
                  <td className="px-3 py-2 font-medium">{e.date}</td>
                  <td className="px-3 py-2">{e.projectName}</td>
                  <td className="px-3 py-2 text-right font-semibold">{e.hours}h</td>
                  <td className="px-3 py-2">{e.activity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.platform ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <Link href={`/reports/monthly?${backQ.toString()}`}>
          <Button type="button" variant="outline" size="sm">Back to list</Button>
        </Link>
      </div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; hours: number; entryCount: number }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span className="truncate" title={r.label}>{r.label}</span>
            <span className="text-right text-sm font-semibold">
              {r.hours}h <span className="text-muted-foreground font-normal">({r.entryCount})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
