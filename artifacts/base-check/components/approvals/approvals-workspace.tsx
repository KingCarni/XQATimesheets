"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { approvePeriod, rejectPeriod, bulkApprovePeriods, bulkRejectPeriods } from "@/app/(app)/approvals/actions";
import { reviewHardwareRequest } from "@/app/(app)/approvals/hardware-actions";
import { reviewPtoRequest } from "@/app/(app)/pto/actions";
import type { ReviewDetailDto, TimeOffGroupDto } from "@/lib/approvals/data";
import type { AdminHardwareRequestDto } from "@/lib/hardware/queries";
import { TimeOffTypeManager, type TimeOffTypeDto } from "./time-off-type-manager";

type TimesheetRow = {
  id: string;
  employee: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  status: string;
  submittedAt: string | null;
  projects: string[];
};

type ProjectOption = { id: string; name: string };
type Tab = "timesheets" | "timeoff" | "hardware";

export function ApprovalsWorkspace({
  initialTab,
  initialPeriodId,
  filters,
  projects,
  rows,
  details,
  timeOffGroups,
  hardwareRequests,
  canReviewHardware,
  canManageTypes,
  timeOffTypes,
}: {
  initialTab: Tab;
  initialPeriodId: string | null;
  filters: { week: string; employee: string; project: string; status: string };
  projects: ProjectOption[];
  rows: TimesheetRow[];
  details: Record<string, ReviewDetailDto>;
  timeOffGroups: TimeOffGroupDto[];
  hardwareRequests: AdminHardwareRequestDto[];
  canReviewHardware: boolean;
  canManageTypes: boolean;
  timeOffTypes: TimeOffTypeDto[];
}) {
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "timesheets", label: "Timesheets", count: rows.filter((r) => r.status === "submitted").length },
    {
      key: "timeoff",
      label: "Time Off",
      count: timeOffGroups.reduce((sum, g) => sum + g.pendingCount, 0),
    },
    ...(canReviewHardware
      ? [
          {
            key: "hardware" as Tab,
            label: "Hardware Requests",
            count: hardwareRequests.filter((r) => r.status === "requested").length,
          },
        ]
      : []),
  ];

  const [tab, setTab] = useState<Tab>(
    initialTab === "hardware" && !canReviewHardware ? "timesheets" : initialTab,
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          Review submissions across your project scope from one dashboard.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-xqa-sky-soft text-xqa-blue" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "timesheets" ? (
        <TimesheetsTab
          initialPeriodId={initialPeriodId}
          filters={filters}
          projects={projects}
          rows={rows}
          details={details}
        />
      ) : null}

      {tab === "timeoff" ? (
        <TimeOffTab groups={timeOffGroups} canManageTypes={canManageTypes} timeOffTypes={timeOffTypes} />
      ) : null}

      {tab === "hardware" && canReviewHardware ? <HardwareTab requests={hardwareRequests} /> : null}
    </div>
  );
}

/* ----------------------------- Timesheets ----------------------------- */

function TimesheetsTab({
  initialPeriodId,
  filters,
  projects,
  rows,
  details,
}: {
  initialPeriodId: string | null;
  filters: { week: string; employee: string; project: string; status: string };
  projects: ProjectOption[];
  rows: TimesheetRow[];
  details: Record<string, ReviewDetailDto>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPeriodId && details[initialPeriodId] ? initialPeriodId : rows[0]?.id ?? null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);

  const submittedIds = useMemo(() => rows.filter((r) => r.status === "submitted").map((r) => r.id), [rows]);
  const selectedSubmitted = [...checked].filter((id) => submittedIds.includes(id));
  const allSubmittedChecked = submittedIds.length > 0 && selectedSubmitted.length === submittedIds.length;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allSubmittedChecked ? new Set() : new Set(submittedIds));
  }

  const detail = selectedId ? details[selectedId] : null;

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="grid gap-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] md:grid-cols-5">
        <input type="hidden" name="tab" value="timesheets" />
        <Input type="date" name="week" defaultValue={filters.week} aria-label="Week" />
        <Input name="employee" placeholder="Employee" defaultValue={filters.employee} />
        <Select name="project" defaultValue={filters.project} aria-label="Project">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status || "submitted"} aria-label="Status">
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </Select>
        <Button type="submit">Filter</Button>
      </form>

      {selectedSubmitted.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-xqa-blue/20 bg-xqa-sky-soft px-4 py-3">
          <span className="text-sm font-semibold text-xqa-blue">{selectedSubmitted.length} selected</span>
          <form action={bulkApprovePeriods}>
            {selectedSubmitted.map((id) => (
              <input key={id} type="hidden" name="periodId" value={id} />
            ))}
            <Button type="submit" size="sm">
              Approve selected
            </Button>
          </form>
          <Button type="button" size="sm" variant="outline" onClick={() => setRejectOpen((v) => !v)}>
            Reject selected
          </Button>
          {rejectOpen ? (
            <form action={bulkRejectPeriods} className="flex flex-wrap items-center gap-2">
              {selectedSubmitted.map((id) => (
                <input key={id} type="hidden" name="periodId" value={id} />
              ))}
              <Input name="comment" placeholder="Rejection reason (required)" required minLength={5} className="min-w-56" />
              <Button type="submit" size="sm" variant="destructive">
                Confirm reject
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all submitted"
                      checked={allSubmittedChecked}
                      onChange={toggleAll}
                      disabled={submittedIds.length === 0}
                    />
                  </th>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Week</th>
                  <th className="px-3 py-3 text-right">Hours</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelected = row.id === selectedId;
                  const submittable = row.status === "submitted";
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-b border-border transition last:border-0 hover:bg-muted/50",
                        isSelected && "bg-xqa-sky-soft/60",
                      )}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.employee}`}
                          checked={checked.has(row.id)}
                          onChange={() => toggle(row.id)}
                          disabled={!submittable}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">{row.employee}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.projects.join(", ") || "No project"}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {row.weekStart} – {row.weekEnd}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{row.totalHours}h</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <EmptyState message="No matching timesheets need review." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <ReviewPanel detail={detail} />
      </div>
    </div>
  );
}

function ReviewPanel({ detail }: { detail: ReviewDetailDto | null }) {
  if (!detail) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Select a row to review its entries and history.
      </div>
    );
  }

  const days = new Map<string, ReviewDetailDto["entries"]>();
  for (const entry of detail.entries) {
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  }

  return (
    <div className="flex max-h-[70vh] flex-col overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{detail.employeeName}</h2>
          <StatusBadge status={detail.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {detail.weekStart} – {detail.weekEnd} · <span className="font-semibold text-foreground">{detail.totalHours}h</span>
        </p>
        {detail.status === "rejected" && detail.rejectionReason ? (
          <p className="mt-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            Rejection reason: {detail.rejectionReason}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {[...days.entries()].map(([day, entries]) => (
          <div key={day} className="rounded-xl border border-border p-3">
            <p className="mb-1.5 text-sm font-semibold">{day}</p>
            <div className="grid gap-1.5 text-sm">
              {entries.map((entry) => (
                <div key={entry.id}>
                  <p className="font-medium">
                    {entry.project} / {entry.platform} / {entry.workType} — {entry.hours}h
                  </p>
                  <p className="text-muted-foreground">{entry.description || "No description"}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {detail.entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 py-4 text-center text-sm text-muted-foreground">
            No entries in this period.
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">History</h3>
        <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
          {detail.history.length === 0 ? (
            <p>No review history yet.</p>
          ) : (
            detail.history.map((h) => (
              <p key={h.id}>
                <span className="capitalize text-foreground">{h.action}</span> by {h.actor} on{" "}
                {new Date(h.at).toLocaleString()}
                {h.comment ? ` — ${h.comment}` : ""}
              </p>
            ))
          )}
        </div>
      </div>

      {detail.status === "submitted" ? (
        <div className="mt-4 grid gap-2 border-t border-border pt-4">
          <form action={approvePeriod}>
            <input type="hidden" name="periodId" value={detail.id} />
            <Button type="submit" className="w-full">
              Approve
            </Button>
          </form>
          <form action={rejectPeriod} className="grid gap-2">
            <input type="hidden" name="periodId" value={detail.id} />
            <Input name="comment" placeholder="Rejection reason" required minLength={5} />
            <Button type="submit" variant="destructive" className="w-full">
              Reject
            </Button>
          </form>
        </div>
      ) : detail.status === "approved" ? (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          This period is approved and read-only.
        </p>
      ) : detail.status === "rejected" ? (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Read-only here; the employee can edit and resubmit it.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ Time Off ------------------------------ */

function TimeOffTab({
  groups,
  canManageTypes,
  timeOffTypes,
}: {
  groups: TimeOffGroupDto[];
  canManageTypes: boolean;
  timeOffTypes: TimeOffTypeDto[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {canManageTypes ? <TimeOffTypeManager types={timeOffTypes} /> : null}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 shadow-[var(--shadow-soft)]">
          <EmptyState message="No time-off requests in your review scope." />
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <TimeOffGroup key={group.profileId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimeOffGroup({ group }: { group: TimeOffGroupDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left transition hover:bg-muted/40"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <div>
            <p className="font-semibold">{group.employeeName}</p>
            <p className="text-xs text-muted-foreground">{group.employeeEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {group.pendingCount > 0 ? (
            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
              {group.pendingCount} pending · {group.pendingHours}h
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No pending</span>
          )}
        </div>
      </button>

      {open ? (
        <div className="grid gap-2 border-t border-border p-4">
          {group.requests.map((req) => (
            <div key={req.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{req.typeName}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-sm">
                    {req.startDate} → {req.endDate} · {req.totalHours}h
                  </p>
                  {req.notes ? <p className="text-sm text-muted-foreground">Note: {req.notes}</p> : null}
                  {req.reviewNote ? (
                    <p className="text-xs text-muted-foreground">Review note: {req.reviewNote}</p>
                  ) : null}
                  {req.approverEmail ? (
                    <p className="text-xs text-muted-foreground">Reviewed by {req.approverEmail}</p>
                  ) : null}
                </div>
                {req.status === "requested" ? (
                  <form action={reviewPtoRequest} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="requestId" value={req.id} />
                    <Input name="comment" placeholder="Review note" className="min-w-44" />
                    <Button type="submit" name="decision" value="approve" size="sm">
                      Approve
                    </Button>
                    <Button type="submit" name="decision" value="reject" size="sm" variant="outline">
                      Reject
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Hardware ------------------------------ */

function HardwareTab({ requests }: { requests: AdminHardwareRequestDto[] }) {
  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 shadow-[var(--shadow-soft)]">
        <EmptyState message="No hardware requests have been submitted." />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {requests.map((req) => (
        <div key={req.id} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{req.employeeName}</span>
                <span className="text-xs text-muted-foreground">{req.employeeEmail}</span>
                <StatusBadge status={req.status} />
                {req.category ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {req.category}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm">{req.details}</p>
              {req.reviewNote ? (
                <p className="mt-1 text-xs text-muted-foreground">Review note: {req.reviewNote}</p>
              ) : null}
              {req.reviewerEmail ? (
                <p className="text-xs text-muted-foreground">
                  Reviewed by {req.reviewerEmail}
                  {req.reviewedAt ? ` on ${new Date(req.reviewedAt).toLocaleDateString()}` : ""}
                </p>
              ) : null}
            </div>
            {req.status === "requested" || req.status === "approved" ? (
              <form action={reviewHardwareRequest} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="requestId" value={req.id} />
                <Input name="reviewNote" placeholder="Review note" className="min-w-44" />
                {req.status === "requested" ? (
                  <>
                    <Button type="submit" name="decision" value="approve" size="sm">
                      Approve
                    </Button>
                    <Button type="submit" name="decision" value="reject" size="sm" variant="outline">
                      Reject
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="submit" name="decision" value="fulfill" size="sm">
                      Mark fulfilled
                    </Button>
                    <Button type="submit" name="decision" value="reject" size="sm" variant="outline">
                      Reject
                    </Button>
                  </>
                )}
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Shared -------------------------------- */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
