import { requireRole } from "@/lib/auth/session";
import { getApprovalQueue, getProjectsForReviewFilters, getReviewDetail, periodSummary } from "@/lib/timesheets/review";
import { approvePeriod, rejectPeriod } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; status?: string; employee?: string; project?: string; period?: string }>;
}) {
  const user = await requireRole("manager", "admin");
  const params = await searchParams;
  const [periods, projects, detail] = await Promise.all([
    getApprovalQueue(user, params),
    getProjectsForReviewFilters(user),
    params.period ? getReviewDetail(user, params.period) : Promise.resolve(null),
  ]);
  const rows = periods.map(periodSummary);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          Review and browse timesheet submissions in your project scope.
        </p>
      </div>

      <form className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:grid-cols-5">
        <Input type="date" name="week" defaultValue={params.week ?? ""} />
        <Input name="employee" placeholder="Employee" defaultValue={params.employee ?? ""} />
        <Select name="project" defaultValue={params.project ?? ""}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={params.status ?? "submitted"}>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </Select>
        <Button type="submit">Filter</Button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Projects</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{row.employee}</td>
                  <td className="px-4 py-3">{row.weekStart} - {row.weekEnd}</td>
                  <td className="px-4 py-3">{row.totalHours}h</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.projects.join(", ") || "None"}</td>
                  <td className="px-4 py-3">{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/approvals?period=${row.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-medium shadow-sm hover:bg-xqa-sky-soft"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                    No matching timesheets need review.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <ReviewDetail period={detail} />
      </div>
    </div>
  );
}

function ReviewDetail({ period }: { period: Awaited<ReturnType<typeof getReviewDetail>> }) {
  if (!period) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        Select a submitted period to inspect entries and review history.
      </div>
    );
  }

  const days = new Map<string, typeof period.time_entries>();
  for (const entry of period.time_entries) {
    const key = entry.entry_date.toISOString().slice(0, 10);
    days.set(key, [...(days.get(key) ?? []), entry]);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{period.employee_profile.full_name}</h2>
          <StatusPill status={period.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {period.week_start_date.toISOString().slice(0, 10)} - {period.week_end_date.toISOString().slice(0, 10)}
        </p>
        <p className="text-sm font-semibold">{period.total_hours.toNumber()}h</p>
        {period.status === "rejected" && period.rejection_reason ? (
          <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            Rejection reason: {period.rejection_reason}
          </p>
        ) : null}
        {period.status !== "submitted" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {period.status === "approved"
              ? "This period is approved and read-only."
              : period.status === "rejected"
                ? "This period is read-only here; the employee can edit and resubmit it."
                : "This period is read-only."}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3">
        {[...days.entries()].map(([day, entries]) => (
          <div key={day} className="rounded-xl border border-border p-3">
            <p className="mb-2 text-sm font-semibold">{day}</p>
            <div className="grid gap-2 text-sm">
              {entries.map((entry) => (
                <div key={entry.id} className="grid gap-1 text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {entry.project?.name ?? "No project"} / {entry.platform?.name ?? "Any"} / {entry.activity_type.name} - {entry.hours.toNumber()}h
                  </p>
                  <p>{entry.description || "No description"}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">History</h3>
        <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
          {period.approvals.map((approval) => (
            <p key={approval.id}>
              <span className="capitalize text-foreground">{approval.action}</span> by{" "}
              {approval.actor.employee_profile?.full_name ?? approval.actor.email} on{" "}
              {approval.created_at.toLocaleString()}
              {approval.comment ? ` - ${approval.comment}` : ""}
            </p>
          ))}
        </div>
      </div>

      {period.status === "submitted" ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          <form action={approvePeriod}>
            <input type="hidden" name="periodId" value={period.id} />
            <Button type="submit" className="w-full">Approve</Button>
          </form>
          <form action={rejectPeriod} className="grid gap-2">
            <input type="hidden" name="periodId" value={period.id} />
            <Input name="comment" placeholder="Rejection reason" required minLength={5} />
            <Button type="submit" variant="destructive" className="w-full">Reject</Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color: Record<string, string> = {
    open: "bg-xqa-sky-soft text-xqa-blue",
    submitted: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    locked: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${color[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
