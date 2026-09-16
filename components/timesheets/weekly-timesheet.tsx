"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Lock,
  Send,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Row } from "@/types/database";
import type { TimesheetStatus } from "@/types/domain";
import {
  isWeekend,
  longDayLabel,
  shiftWeek,
  todayStr,
  weekdayLabel,
  weekRangeLabel,
  type DateStr,
  type WeekRange,
} from "@/lib/timesheets/week";
import {
  copyPreviousDay,
  copyPreviousWeek,
  submitWeek,
  validateWeek,
} from "@/app/(app)/my-timesheet/actions";
import type { WeekSubmissionValidation } from "@/lib/timesheets/validation";
import { EntryRow, type Catalogs } from "./entry-row";
import {
  AddEntryForm,
  type EntryPrefill,
} from "./add-entry-form";

type Entry = Row<"time_entries">;

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function WeeklyTimesheet({
  weekStart,
  week,
  periodStatus,
  submittedAt,
  rejectionReason,
  editable,
  initialEntries,
  catalogs,
  templates,
}: {
  weekStart: DateStr;
  week: WeekRange;
  periodStatus: TimesheetStatus | null;
  submittedAt?: string | null;
  rejectionReason?: string | null;
  editable: boolean;
  initialEntries: Entry[];
  catalogs: Catalogs;
  templates: Row<"entry_templates">[];
}) {
  const [entries, setEntries] =
    useState<Entry[]>(initialEntries);

  const weekendHasEntries = entries.some((entry) =>
    isWeekend(entry.entry_date),
  );

  const [showWeekend, setShowWeekend] =
    useState(weekendHasEntries);

  const [prefill, setPrefill] = useState<{
    value: EntryPrefill;
    key: number;
  } | null>(null);

  const [copyError, setCopyError] =
    useState<string | null>(null);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const [validation, setValidation] =
    useState<WeekSubmissionValidation | null>(null);

  const [confirmSubmit, setConfirmSubmit] =
    useState(false);

  const [copyPending, startCopy] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const router = useRouter();

  const initialSelected = useMemo(() => {
    const today = todayStr();

    return week.days.includes(today)
      ? today
      : week.days[0];
  }, [week.days]);

  const [selectedDate, setSelectedDate] =
    useState<DateStr>(initialSelected);

  const byDate = useMemo(() => {
    const map = new Map<DateStr, Entry[]>();

    for (const day of week.days) {
      map.set(day, []);
    }

    for (const entry of entries) {
      map.get(entry.entry_date)?.push(entry);
    }

    return map;
  }, [entries, week.days]);

  const ptoActivityIds = useMemo(
    () =>
      new Set(
        catalogs.activityTypes
          .filter((activity) => activity.is_pto)
          .map((activity) => activity.id),
      ),
    [catalogs.activityTypes],
  );

  const billableActivityIds = useMemo(
    () =>
      new Set(
        catalogs.activityTypes
          .filter((activity) => activity.is_billable)
          .map((activity) => activity.id),
      ),
    [catalogs.activityTypes],
  );

  const dailyTotal = (date: DateStr) =>
    (byDate.get(date) ?? []).reduce(
      (sum, entry) => sum + Number(entry.hours),
      0,
    );

  const weekTotal = entries.reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );

  const ptoTotal = entries.reduce(
    (sum, entry) =>
      sum +
      (ptoActivityIds.has(entry.activity_type_id)
        ? Number(entry.hours)
        : 0),
    0,
  );

  const billableTotal = entries.reduce(
    (sum, entry) =>
      sum +
      (billableActivityIds.has(entry.activity_type_id)
        ? Number(entry.hours)
        : 0),
    0,
  );

  const dayEntries = byDate.get(selectedDate) ?? [];
  const dayLogged = dailyTotal(selectedDate);

  const upsert = (entry: Entry) =>
    setEntries((previous) => {
      const index = previous.findIndex(
        (existing) => existing.id === entry.id,
      );

      if (index === -1) {
        return [...previous, entry];
      }

      const next = previous.slice();
      next[index] = entry;

      return next;
    });

  const append = (list: Entry[]) =>
    setEntries((previous) => [...previous, ...list]);

  const removeLocal = (id: string) =>
    setEntries((previous) =>
      previous.filter((entry) => entry.id !== id),
    );

  function runCopyDay() {
    setCopyError(null);

    startCopy(async () => {
      const result = await copyPreviousDay(
        weekStart,
        selectedDate,
      );

      if (result.ok) {
        append(result.data);
      } else {
        setCopyError(result.error);
      }
    });
  }

  function runCopyWeek() {
    setCopyError(null);

    startCopy(async () => {
      const result = await copyPreviousWeek(weekStart);

      if (result.ok) {
        append(result.data);
      } else {
        setCopyError(result.error);
      }
    });
  }

  function runValidateSubmit() {
    setSubmitError(null);

    startSubmit(async () => {
      const result = await validateWeek(weekStart);

      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }

      setValidation(result.data);

      if (result.data.ok) {
        setConfirmSubmit(true);
      } else {
        setSubmitError(
          "Fix the blocking issues before submitting.",
        );
      }
    });
  }

  function runSubmitWeek() {
    setSubmitError(null);

    startSubmit(async () => {
      const result = await submitWeek(weekStart);

      if (result.ok) {
        setConfirmSubmit(false);
        setValidation(null);
        // Re-fetch so the server-rendered submitted banner + locked state
        // appear immediately (periodStatus/editable come from the server).
        router.refresh();
      } else {
        setSubmitError(result.error);
      }
    });
  }

  const visibleDays = week.days.filter(
    (day) => showWeekend || !isWeekend(day),
  );

  const projectNames = useMemo(() => {
    const byId = new Map(catalogs.projects.map((p) => [p.id, p.name]));
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.project_id) set.add(byId.get(entry.project_id) ?? "Unknown");
    }
    return [...set];
  }, [entries, catalogs.projects]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="from-xqa-blue to-xqa-blue-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg shadow-xqa-blue/25">
            <CalendarDays className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              My Timesheet
            </h1>

            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              {weekRangeLabel(week)}
              <span className="bg-xqa-pink h-1.5 w-1.5 rounded-full" />
              <span className="font-semibold text-foreground">
                {fmt(weekTotal)}h
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable || copyPending}
            onClick={runCopyWeek}
          >
            <Copy className="h-4 w-4" />
            Copy Previous Week
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!editable || submitPending}
            onClick={runValidateSubmit}
          >
            Submit Week
          </Button>

          <WeekNav weekStart={weekStart} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Clock3}
          label="Total Hours"
          value={fmt(weekTotal)}
          tone="blue"
        />

        <SummaryCard
          icon={CheckCircle2}
          label="PTO Hours"
          value={fmt(ptoTotal)}
          tone="green"
        />

        <SummaryCard
          icon={BriefcaseBusiness}
          label="Billable Hours"
          value={fmt(billableTotal)}
          tone="orange"
        />
      </div>

      <PeriodBanner status={periodStatus} submittedAt={submittedAt} rejectionReason={rejectionReason} />

      <div className="border-border bg-card rounded-2xl border shadow-[var(--shadow-soft)]">
        {validation && !confirmSubmit ? (
          <div className="border-b border-border px-4 py-3 text-sm sm:px-5">
            <p className="font-semibold">
              Submission check:{" "}
              {fmt(validation.loggedHours)} logged h,{" "}
              {fmt(validation.ptoHours)} PTO h,{" "}
              {validation.errors.length} errors,{" "}
              {validation.warnings.length} warnings
            </p>

            {validation.errors.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-destructive">
                {validation.errors.map((issue) => (
                  <li key={issue.date}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {validation.warnings.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {validation.warnings.map((issue) => (
                  <li key={issue.date}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {submitError ? (
          <div className="border-b border-xqa-pink/20 bg-xqa-pink/8 px-4 py-3 text-sm text-destructive sm:px-5">
            {submitError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <StatusBadge status={periodStatus} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!editable || copyPending}
              onClick={runCopyDay}
            >
              <Copy className="h-4 w-4" />
              Copy Previous Day
            </Button>

            {copyError ? (
              <span className="text-destructive text-xs">
                {copyError}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 px-4 py-4 sm:px-5">
          {visibleDays.map((day) => {
            const total = dailyTotal(day);
            const weekend = isWeekend(day);
            const active = day === selectedDate;

            return (
              <button
                key={day}
                type="button"
                onClick={() =>
                  setSelectedDate(day)
                }
                className={cn(
                  "flex min-w-[88px] flex-col rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-xqa-blue bg-xqa-sky-soft text-foreground shadow-sm"
                    : "border-border hover:bg-muted",
                  weekend && "opacity-60",
                )}
              >
                <span className="text-xs font-semibold">
                  {weekdayLabel(day)}
                  {weekend ? " *" : ""}
                </span>

                <span className="text-sm font-semibold text-foreground">
                  {fmt(total)}h
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setShowWeekend((value) => !value)
            }
            className="border-border text-muted-foreground hover:bg-muted min-w-[88px] rounded-xl border border-dashed px-3 py-2 text-xs font-semibold"
          >
            {showWeekend
              ? "Hide weekend"
              : "Show weekend"}
          </button>
        </div>

        <div className="overflow-x-auto border-t border-border p-4 sm:p-5">
          <div className="mb-3 flex min-w-[880px] flex-wrap items-baseline justify-between gap-2 lg:min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {longDayLabel(selectedDate)}
            </h2>

            <p className="text-sm">
              <span className="text-muted-foreground">
                Logged{" "}
              </span>

              <span className="font-semibold text-foreground">
                {fmt(dayLogged)}h
              </span>
            </p>
          </div>

          {dayEntries.length > 0 ? (
            <div className="text-muted-foreground grid min-w-[880px] grid-cols-[1.4fr_1fr_1.4fr_0.6fr_2fr_auto] gap-2 border-b border-border pb-2 text-xs font-semibold lg:min-w-0">
              <span>Project</span>
              <span>Platform</span>
              <span>Work Type</span>
              <span className="text-right">
                Hours
              </span>
              <span>Description</span>
              <span />
            </div>
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed border-border bg-muted/40 py-4 text-center text-sm">
              No entries yet for this day.
            </p>
          )}

          {dayEntries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              catalogs={catalogs}
              editable={editable}
              onSaved={upsert}
              onRemoved={removeLocal}
            />
          ))}

          {editable ? (
            <>
              {templates.length > 0 ? (
                <div className="mt-3 flex min-w-[880px] flex-wrap items-center gap-2 lg:min-w-0">
                  <span className="text-muted-foreground text-xs">
                    Templates:
                  </span>

                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() =>
                        setPrefill({
                          value: {
                            projectId:
                              template.project_id ??
                              "",
                            platformId:
                              template.platform_id ??
                              "",
                            activityId:
                              template.activity_type_id,
                            description:
                              template.description ??
                              "",
                          },
                          key: Date.now(),
                        })
                      }
                      className="border-border hover:bg-xqa-sky-soft rounded-full border bg-white px-3 py-1 text-xs font-medium shadow-sm"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <AddEntryForm
                key={prefill?.key ?? "add"}
                weekStart={weekStart}
                entryDate={selectedDate}
                catalogs={catalogs}
                initial={prefill?.value}
                onAdded={upsert}
              />
            </>
          ) : null}
        </div>
      </div>

      {confirmSubmit ? (
        <SubmitConfirmModal
          weekLabel={weekRangeLabel(week)}
          totalHours={fmt(weekTotal)}
          entryCount={entries.length}
          projects={projectNames}
          pending={submitPending}
          onCancel={() => setConfirmSubmit(false)}
          onConfirm={runSubmitWeek}
        />
      ) : null}
    </div>
  );
}

function PeriodBanner({
  status,
  submittedAt,
  rejectionReason,
}: {
  status: TimesheetStatus | null;
  submittedAt?: string | null;
  rejectionReason?: string | null;
}) {
  if (status === "submitted") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-warning bg-warning/15 px-5 py-4 shadow-[var(--shadow-soft)]">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">Week submitted</p>
          <p className="text-sm text-foreground/80">
            Awaiting manager review — this timesheet is locked and can no longer be edited unless a reviewer rejects it.
          </p>
          {submittedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Submitted {new Date(submittedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (status === "approved" || status === "locked") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-success bg-success/15 px-5 py-4 shadow-[var(--shadow-soft)]">
        <Lock className="mt-0.5 h-6 w-6 shrink-0 text-success" />
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">
            Week {status === "approved" ? "approved" : "locked"}
          </p>
          <p className="text-sm text-foreground/80">This timesheet is finalized and read-only.</p>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 px-5 py-4 shadow-[var(--shadow-soft)]">
        <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
        <div>
          <p className="text-base font-bold tracking-tight text-foreground">Changes requested</p>
          <p className="text-sm text-foreground/80">
            A reviewer returned this week. Make the corrections below and submit it again.
          </p>
          {rejectionReason ? (
            <p className="mt-1 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive">
              Reason: {rejectionReason}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}

function SubmitConfirmModal({
  weekLabel,
  totalHours,
  entryCount,
  projects,
  pending,
  onCancel,
  onConfirm,
}: {
  weekLabel: string;
  totalHours: string;
  entryCount: number;
  projects: string[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-week-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-warning bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b-2 border-warning bg-warning/20 px-5 py-4">
          <AlertTriangle className="h-6 w-6 shrink-0 text-warning" />
          <h2 id="submit-week-title" className="text-lg font-bold tracking-tight">
            Submit this week?
          </h2>
        </div>

        <div className="grid gap-3 px-5 py-4">
          <p className="text-sm text-foreground/80">
            Once submitted, this timesheet can <strong>no longer be edited</strong> unless it is rejected by a reviewer.
          </p>

          <dl className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Week</dt>
              <dd className="text-right font-semibold">{weekLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Total hours</dt>
              <dd className="font-semibold">{totalHours}h</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Entries</dt>
              <dd className="font-semibold">{entryCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Projects</dt>
              <dd className="text-right font-semibold">{projects.length > 0 ? projects.join(", ") : "None"}</dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-warning px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {pending ? "Submitting…" : "Confirm Submission"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  tone: "blue" | "green" | "orange";
}) {
  const tones = {
    blue: "bg-xqa-sky-soft text-xqa-blue",
    green: "bg-green-50 text-success",
    orange: "bg-orange-50 text-warning",
  };

  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          tones[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>

      <div>
        <p className="text-xl font-semibold tracking-tight">
          {value}
        </p>

        <p className="text-muted-foreground text-xs font-medium">
          {label}
        </p>
      </div>
    </div>
  );
}

function WeekNav({
  weekStart,
}: {
  weekStart: DateStr;
}) {
  const base = "/my-timesheet";

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Link
        href={`${base}?week=${shiftWeek(
          weekStart,
          -1,
        )}`}
        className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground"
      >
        Prev
      </Link>

      <Link
        href={base}
        className="from-xqa-blue to-xqa-blue-2 rounded-lg bg-gradient-to-r px-3 py-1 text-sm font-semibold text-white"
      >
        Today
      </Link>

      <Link
        href={`${base}?week=${shiftWeek(
          weekStart,
          1,
        )}`}
        className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground"
      >
        Next
      </Link>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: TimesheetStatus | null;
}) {
  const currentStatus = status ?? "open";

  const color: Record<TimesheetStatus, string> = {
    open: "bg-xqa-sky-soft text-xqa-blue",
    submitted: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected:
      "bg-destructive/15 text-destructive",
    locked: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        color[currentStatus],
      )}
    >
      {currentStatus}
    </span>
  );
}
