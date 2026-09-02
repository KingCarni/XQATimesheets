"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Lock,
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
        setValidation(result.data);
      } else {
        setSubmitError(result.error);
      }
    });
  }

  const visibleDays = week.days.filter(
    (day) => showWeekend || !isWeekend(day),
  );

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

      <div className="border-border bg-card rounded-2xl border shadow-[var(--shadow-soft)]">
        {periodStatus === "submitted" ? (
          <div className="border-b border-border bg-xqa-sky-soft px-4 py-3 text-sm text-xqa-blue sm:px-5">
            Awaiting manager review
            {submittedAt
              ? ` - submitted ${new Date(
                  submittedAt,
                ).toLocaleString()}`
              : ""}
          </div>
        ) : null}

        {periodStatus === "rejected" &&
        rejectionReason ? (
          <div className="border-b border-xqa-pink/20 bg-xqa-pink/8 px-4 py-3 text-sm text-destructive sm:px-5">
            Corrections required: {rejectionReason}
          </div>
        ) : null}

        {validation ? (
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

            {confirmSubmit ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={submitPending}
                  onClick={runSubmitWeek}
                >
                  Confirm Submit
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setConfirmSubmit(false)
                  }
                >
                  Cancel
                </Button>
              </div>
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

        {!editable ? (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-xqa-pink/20 bg-xqa-pink/8 p-3 text-sm text-destructive sm:mx-5">
            <Lock className="h-4 w-4" />
            This week is {periodStatus} and can no
            longer be edited.
          </div>
        ) : null}

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
