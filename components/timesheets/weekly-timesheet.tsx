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
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Row } from "@/types/database";
import type { TimesheetStatus } from "@/types/domain";
import {
  dayState,
  expectedHoursForDay,
  expectedHoursForWeek,
  isWeekend,
  longDayLabel,
  shiftWeek,
  todayStr,
  weekdayLabel,
  weekRangeLabel,
  type DateStr,
  type DayState,
  type WeekRange,
} from "@/lib/timesheets/week";
import { copyPreviousDay, copyPreviousWeek } from "@/app/(app)/my-timesheet/actions";
import { EntryRow, type Catalogs } from "./entry-row";
import { AddEntryForm, type EntryPrefill } from "./add-entry-form";

type Entry = Row<"time_entries">;

const STATE_TEXT: Record<DayState, string> = {
  empty: "text-muted-foreground",
  under: "text-warning",
  over: "text-destructive",
  exact: "text-success",
  neutral: "text-foreground",
};

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function WeeklyTimesheet({
  weekStart,
  week,
  defaultDailyHours,
  periodStatus,
  editable,
  initialEntries,
  catalogs,
  templates,
}: {
  weekStart: DateStr;
  week: WeekRange;
  defaultDailyHours: number;
  periodStatus: TimesheetStatus | null;
  editable: boolean;
  initialEntries: Entry[];
  catalogs: Catalogs;
  templates: Row<"entry_templates">[];
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const weekendHasEntries = entries.some((e) => isWeekend(e.entry_date));
  const [showWeekend, setShowWeekend] = useState(weekendHasEntries);
  const [prefill, setPrefill] = useState<{ value: EntryPrefill; key: number } | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyPending, startCopy] = useTransition();

  const initialSelected = useMemo(() => {
    const t = todayStr();
    return week.days.includes(t) ? t : week.days[0];
  }, [week.days]);
  const [selectedDate, setSelectedDate] = useState<DateStr>(initialSelected);

  const byDate = useMemo(() => {
    const map = new Map<DateStr, Entry[]>();
    for (const d of week.days) map.set(d, []);
    for (const e of entries) map.get(e.entry_date)?.push(e);
    return map;
  }, [entries, week.days]);

  const ptoActivityIds = useMemo(
    () => new Set(catalogs.activityTypes.filter((a) => a.is_pto).map((a) => a.id)),
    [catalogs.activityTypes],
  );
  const billableActivityIds = useMemo(
    () => new Set(catalogs.activityTypes.filter((a) => a.is_billable).map((a) => a.id)),
    [catalogs.activityTypes],
  );

  const dailyTotal = (d: DateStr) => (byDate.get(d) ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const weekTotal = entries.reduce((s, e) => s + Number(e.hours), 0);
  const ptoTotal = entries.reduce(
    (s, e) => s + (ptoActivityIds.has(e.activity_type_id) ? Number(e.hours) : 0),
    0,
  );
  const billableTotal = entries.reduce(
    (s, e) => s + (billableActivityIds.has(e.activity_type_id) ? Number(e.hours) : 0),
    0,
  );
  const weekExpected = expectedHoursForWeek(defaultDailyHours);
  const weekStateColor = STATE_TEXT[dayState(weekTotal, weekExpected)];

  const dayEntries = byDate.get(selectedDate) ?? [];
  const dayExpected = expectedHoursForDay(selectedDate, defaultDailyHours);
  const dayLogged = dailyTotal(selectedDate);
  const dayRemaining = dayExpected - dayLogged;
  const dayColor = STATE_TEXT[dayState(dayLogged, dayExpected)];

  const upsert = (e: Entry) =>
    setEntries((prev) => {
      const i = prev.findIndex((x) => x.id === e.id);
      if (i === -1) return [...prev, e];
      const next = prev.slice();
      next[i] = e;
      return next;
    });
  const append = (list: Entry[]) => setEntries((prev) => [...prev, ...list]);
  const removeLocal = (id: string) => setEntries((prev) => prev.filter((x) => x.id !== id));

  function runCopyDay() {
    setCopyError(null);
    startCopy(async () => {
      const res = await copyPreviousDay(weekStart, selectedDate);
      if (res.ok) append(res.data);
      else setCopyError(res.error);
    });
  }
  function runCopyWeek() {
    setCopyError(null);
    startCopy(async () => {
      const res = await copyPreviousWeek(weekStart);
      if (res.ok) append(res.data);
      else setCopyError(res.error);
    });
  }

  const visibleDays = week.days.filter((d) => showWeekend || !isWeekend(d));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="from-xqa-blue to-xqa-blue-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg shadow-xqa-blue/25">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Timesheet</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              {weekRangeLabel(week)}
              <span className="bg-xqa-pink h-1.5 w-1.5 rounded-full" />
              <span className={cn("font-semibold", weekStateColor)}>
                {fmt(weekTotal)} / {fmt(weekExpected)}h
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
            <Copy className="h-4 w-4" /> Copy Previous Week
          </Button>
          <WeekNav weekStart={weekStart} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Clock3} label="Total Hours" value={fmt(weekTotal)} tone="blue" />
        <SummaryCard icon={CheckCircle2} label="PTO Hours" value={fmt(ptoTotal)} tone="green" />
        <SummaryCard
          icon={BriefcaseBusiness}
          label="Billable Hours"
          value={fmt(billableTotal)}
          tone="orange"
        />
        <SummaryCard icon={Target} label="Daily Target" value={fmt(defaultDailyHours)} tone="slate" />
      </div>

      <div className="border-border bg-card rounded-2xl border shadow-[var(--shadow-soft)]">
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
              <Copy className="h-4 w-4" /> Copy Previous Day
            </Button>
            {copyError ? <span className="text-destructive text-xs">{copyError}</span> : null}
          </div>
        </div>

        {!editable ? (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-xqa-pink/20 bg-xqa-pink/8 p-3 text-sm text-destructive sm:mx-5">
            <Lock className="h-4 w-4" /> This week is {periodStatus} and can no longer be edited.
          </div>
        ) : null}

        <div className="flex flex-wrap items-stretch gap-2 px-4 py-4 sm:px-5">
          {visibleDays.map((d) => {
            const total = dailyTotal(d);
            const expected = expectedHoursForDay(d, defaultDailyHours);
            const st = dayState(total, expected);
            const weekend = isWeekend(d);
            const active = d === selectedDate;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={cn(
                  "flex min-w-[88px] flex-col rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-xqa-blue bg-xqa-sky-soft text-foreground shadow-sm"
                    : "border-border hover:bg-muted",
                  weekend && "opacity-60",
                )}
              >
                <span className="text-xs font-semibold">
                  {weekdayLabel(d)}
                  {weekend ? " *" : ""}
                </span>
                <span className={cn("text-sm font-semibold", STATE_TEXT[st])}>
                  {expected > 0 ? `${fmt(total)} / ${fmt(expected)}h` : `${fmt(total)}h`}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowWeekend((v) => !v)}
            className="border-border text-muted-foreground hover:bg-muted min-w-[88px] rounded-xl border border-dashed px-3 py-2 text-xs font-semibold"
          >
            {showWeekend ? "Hide weekend" : "Show weekend"}
          </button>
        </div>

        <div className="overflow-x-auto border-t border-border p-4 sm:p-5">
          <div className="mb-3 flex min-w-[880px] flex-wrap items-baseline justify-between gap-2 lg:min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{longDayLabel(selectedDate)}</h2>
            <p className="text-sm">
              <span className="text-muted-foreground">Logged </span>
              <span className={cn("font-semibold", dayColor)}>{fmt(dayLogged)}h</span>
              {dayExpected > 0 ? (
                <>
                  <span className="text-muted-foreground"> of {fmt(dayExpected)}h - </span>
                  {dayRemaining > 0 ? (
                    <span className="text-warning">{fmt(dayRemaining)}h remaining</span>
                  ) : dayRemaining < 0 ? (
                    <span className="text-destructive">{fmt(-dayRemaining)}h over</span>
                  ) : (
                    <span className="text-success">complete</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground"> - weekend</span>
              )}
            </p>
          </div>

          {dayEntries.length > 0 ? (
            <div className="text-muted-foreground grid min-w-[880px] grid-cols-[1.4fr_1fr_1.4fr_0.6fr_2fr_auto] gap-2 border-b border-border pb-2 text-xs font-semibold lg:min-w-0">
              <span>Project</span>
              <span>Platform</span>
              <span>Work Type</span>
              <span className="text-right">Hours</span>
              <span>Description</span>
              <span />
            </div>
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed border-border bg-muted/40 py-4 text-center text-sm">
              No entries yet for this day.
            </p>
          )}

          {dayEntries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
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
                  <span className="text-muted-foreground text-xs">Templates:</span>
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setPrefill({
                          value: {
                            projectId: t.project_id ?? "",
                            platformId: t.platform_id ?? "",
                            activityId: t.activity_type_id,
                            description: t.description ?? "",
                          },
                          key: Date.now(),
                        })
                      }
                      className="border-border hover:bg-xqa-sky-soft rounded-full border bg-white px-3 py-1 text-xs font-medium shadow-sm"
                    >
                      {t.label}
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
  tone: "blue" | "green" | "orange" | "slate";
}) {
  const tones = {
    blue: "bg-xqa-sky-soft text-xqa-blue",
    green: "bg-green-50 text-success",
    orange: "bg-orange-50 text-warning",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="border-border bg-card flex items-center gap-4 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}

function WeekNav({ weekStart }: { weekStart: DateStr }) {
  const base = "/my-timesheet";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Link
        href={`${base}?week=${shiftWeek(weekStart, -1)}`}
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
        href={`${base}?week=${shiftWeek(weekStart, 1)}`}
        className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground"
      >
        Next
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: TimesheetStatus | null }) {
  const s = status ?? "open";
  const color: Record<TimesheetStatus, string> = {
    open: "bg-xqa-sky-soft text-xqa-blue",
    submitted: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    locked: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", color[s])}>
      {s}
    </span>
  );
}
