"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, Copy, Lock } from "lucide-react";

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

  const dailyTotal = (d: DateStr) => (byDate.get(d) ?? []).reduce((s, e) => s + Number(e.hours), 0);
  const weekTotal = entries.reduce((s, e) => s + Number(e.hours), 0);
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Timesheet</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4" /> {weekRangeLabel(week)}
            <StatusBadge status={periodStatus} />
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-muted-foreground text-xs">Week total</p>
            <p className={cn("text-lg font-semibold", weekStateColor)}>
              {fmt(weekTotal)} / {fmt(weekExpected)}h
            </p>
          </div>
          <WeekNav weekStart={weekStart} />
        </div>
      </div>

      {!editable ? (
        <div className="border-border bg-muted text-muted-foreground flex items-center gap-2 rounded-md border p-3 text-sm">
          <Lock className="h-4 w-4" /> This week is {periodStatus} and can no longer be edited.
        </div>
      ) : null}

      {/* Day tabs */}
      <div className="flex flex-wrap items-stretch gap-2">
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
                "flex min-w-[84px] flex-col rounded-md border px-3 py-2 text-left transition-colors",
                active ? "border-ring bg-card" : "border-border hover:bg-muted",
                weekend && "opacity-70",
              )}
            >
              <span className="text-xs font-medium">
                {weekdayLabel(d)}
                {weekend ? " ·" : ""}
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
          className="border-border text-muted-foreground hover:bg-muted min-w-[84px] rounded-md border border-dashed px-3 py-2 text-xs"
        >
          {showWeekend ? "Hide weekend" : "Show weekend"}
        </button>
      </div>

      {/* Copy actions */}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable || copyPending}
          onClick={runCopyWeek}
        >
          <Copy className="h-4 w-4" /> Copy Previous Week
        </Button>
        {copyError ? <span className="text-destructive text-xs">{copyError}</span> : null}
      </div>

      {/* Selected day panel */}
      <div className="border-border bg-card rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{longDayLabel(selectedDate)}</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">Logged </span>
            <span className={cn("font-semibold", dayColor)}>{fmt(dayLogged)}h</span>
            {dayExpected > 0 ? (
              <>
                <span className="text-muted-foreground"> of {fmt(dayExpected)}h · </span>
                {dayRemaining > 0 ? (
                  <span className="text-warning">{fmt(dayRemaining)}h remaining</span>
                ) : dayRemaining < 0 ? (
                  <span className="text-destructive">{fmt(-dayRemaining)}h over</span>
                ) : (
                  <span className="text-success">complete</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground"> · weekend</span>
            )}
          </p>
        </div>

        {/* Column headers */}
        {dayEntries.length > 0 ? (
          <div className="text-muted-foreground grid grid-cols-[1.4fr_1fr_1.4fr_0.6fr_2fr_auto] gap-2 border-b pb-1 text-xs font-medium">
            <span>Project</span>
            <span>Platform</span>
            <span>Work Type</span>
            <span className="text-right">Hours</span>
            <span>Description</span>
            <span />
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-sm">No entries yet for this day.</p>
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
                    className="border-border hover:bg-muted rounded-full border px-3 py-1 text-xs"
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
  );
}

function WeekNav({ weekStart }: { weekStart: DateStr }) {
  const base = "/my-timesheet";
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`${base}?week=${shiftWeek(weekStart, -1)}`}
        className="border-border hover:bg-muted rounded-md border px-2 py-1 text-sm"
      >
        ‹
      </Link>
      <Link
        href={base}
        className="border-border hover:bg-muted rounded-md border px-3 py-1 text-sm"
      >
        Today
      </Link>
      <Link
        href={`${base}?week=${shiftWeek(weekStart, 1)}`}
        className="border-border hover:bg-muted rounded-md border px-2 py-1 text-sm"
      >
        ›
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: TimesheetStatus | null }) {
  const s = status ?? "open";
  const color: Record<TimesheetStatus, string> = {
    open: "bg-muted text-muted-foreground",
    submitted: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    locked: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", color[s])}>
      {s}
    </span>
  );
}
