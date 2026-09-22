import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { hasReviewScope } from "@/lib/auth/authorization";
import { requireOrganizationContext } from "@/lib/tenant/context";
import { getReviewPeriodDetail } from "@/lib/timesheets/team-review";
import { StatusBadge } from "@/components/shared/status-badge";
import { sendReminder } from "./actions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Review-detail view for one (employee × project × operational period). Reuses
 * the reviewer authorization from the workspace list (`getReviewPeriodDetail`
 * re-verifies scope on the ref) so a hand-crafted URL cannot reach data the
 * viewer isn't allowed to see. Approve/Reject are handled by the existing
 * Approvals queue — a link is provided rather than duplicating the mutation.
 */
export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { user, organization, membership } = await requireOrganizationContext();
  const viewer = { ...user, role: membership.role };
  if (!(await hasReviewScope(viewer, organization.id))) redirect("/my-timesheet");

  const { ref: routeRef } = await params;
  const decodedRef = decodeURIComponent(routeRef);
  const sp = await searchParams;
  const backRef = sp.ref && DATE_RE.test(sp.ref) ? sp.ref : "";

  const detail = await getReviewPeriodDetail(viewer, organization.id, decodedRef);
  if (!detail) notFound();

  // Group entries by date, preserving the day grid's period-anchored rows so
  // the reviewer sees the same visualization My Timesheet shows the employee.
  const entriesByDate = new Map<string, typeof detail.entries>();
  for (const e of detail.entries) {
    const arr = entriesByDate.get(e.date) ?? [];
    arr.push(e);
    entriesByDate.set(e.date, arr);
  }
  const hoursByDate = new Map<string, number>();
  for (const [date, list] of entriesByDate) {
    hoursByDate.set(date, list.reduce((sum, e) => sum + e.hours, 0));
  }

  const approvalsHref = detail.header.isGeneral
    ? `/approvals?tab=timesheets&period=${encodeURIComponent(detail.header.ref)}`
    : `/approvals?tab=timesheets&period=${encodeURIComponent(detail.header.ref)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/team${backRef ? `?ref=${backRef}` : ""}`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Hours Review
        </Link>
        <div className="flex items-center gap-2">
          {membership.role === "admin" && (detail.header.status === "open" || detail.header.status === "rejected") ? (
            <form action={sendReminder}>
              <input type="hidden" name="periodRef" value={detail.header.ref} />
              <button
                type="submit"
                className="border-border text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-semibold shadow-sm"
                title="Send a system-generated reminder to the owning employee"
              >
                Send reminder
              </button>
            </form>
          ) : null}
          {detail.header.status === "submitted" || detail.header.status === "rejected" ? (
            <Link
              href={approvalsHref}
              className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm"
            >
              Review in Approvals →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{detail.header.employeeName}</h1>
            <p className="text-muted-foreground text-sm">{detail.header.employeeEmail}</p>
            <p className="mt-2 text-base font-semibold">
              {detail.header.projectName}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                · {detail.header.periodStart} → {detail.header.periodEnd} · {detail.header.cadence}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-3xl font-semibold tabular-nums">{detail.header.totalHours}h</span>
            <StatusBadge status={detail.header.status} />
            {detail.header.submittedAt ? (
              <p className="text-muted-foreground text-xs">
                Submitted {detail.header.submittedAt.slice(0, 10)}
              </p>
            ) : null}
          </div>
        </div>
        {detail.header.status === "rejected" && detail.header.rejectionReason ? (
          <p className="border-destructive/20 bg-destructive/8 text-destructive mt-3 rounded-lg border px-3 py-2 text-sm">
            Changes requested: {detail.header.rejectionReason}
          </p>
        ) : null}
      </div>

      {/* Day grid — same period-anchored chunk visualization as My Timesheet. */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <p className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">
          Daily totals
        </p>
        <div className="flex flex-col gap-2">
          {detail.visualRows.map((row) => (
            <div key={row[0]} className="overflow-x-auto">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(4.75rem, 1fr))` }}
              >
                {row.map((date) => {
                  const hours = hoursByDate.get(date) ?? 0;
                  return (
                    <div
                      key={date}
                      className="border-border bg-card flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center"
                    >
                      <span className="text-muted-foreground text-[10px] font-semibold uppercase">
                        {new Date(date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
                      </span>
                      <span className="text-xs font-medium">{date.slice(5)}</span>
                      <span className={`text-sm font-semibold tabular-nums ${hours === 0 ? "text-muted-foreground" : ""}`}>
                        {hours}h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-date entry detail — MHV-9 core requirement. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Entries</h2>
        {detail.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
            No entries in this period.
          </div>
        ) : (
          [...entriesByDate.entries()].map(([date, list]) => (
            <div key={date} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="font-semibold">
                  {new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {list.reduce((sum, e) => sum + e.hours, 0)}h
                </p>
              </div>
              <ul className="flex flex-col divide-y divide-border">
                {list.map((e) => (
                  <li key={e.id} className="grid gap-1 py-2 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-medium">
                        {e.activityName || "—"}
                        {e.platformName ? (
                          <span className="text-muted-foreground"> · {e.platformName}</span>
                        ) : null}
                      </p>
                      {e.description ? (
                        <p className="text-muted-foreground mt-0.5 text-sm">{e.description}</p>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold tabular-nums sm:text-right">{e.hours}h</p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
