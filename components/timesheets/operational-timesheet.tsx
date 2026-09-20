"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Clock3, CalendarRange, CalendarClock, Lock, Plus, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Row } from "@/types/database";
import { submitProjectPeriod, submitWeek } from "@/app/(app)/my-timesheet/actions";
import { longDayLabel, shiftWeek, weekRangeLabel, type WeekRange } from "@/lib/timesheets/week";
import type {
  GeneralSection,
  MyTimesheetCatalogs,
  ProjectPeriodSection,
} from "@/lib/timesheets/operational-view";
import {
  chunkPeriodDays,
  dayTotal,
  normalizeSelectedDay,
  periodTotal,
  weekTotalForPeriod,
} from "@/lib/timesheets/summary";
import { format, parseISO } from "date-fns";
import { EntryRow, type Catalogs } from "./entry-row";
import { AddEntryForm } from "./add-entry-form";

type Entry = Row<"time_entries">;

const fmt = (n: number) => Number(n.toFixed(2)).toString();

export function OperationalTimesheet({
  today,
  projectSections,
  general,
  catalogs,
  templates,
}: {
  today: string;
  projectSections: ProjectPeriodSection[];
  general: GeneralSection;
  catalogs: MyTimesheetCatalogs;
  templates: Row<"entry_templates">[];
}) {
  const entryCatalogs: Catalogs = catalogs;
  // The General card only appears when it has actual content — either non-project
  // entries this week, or an already-persisted legacy weekly row (e.g. previously
  // submitted). An empty General card would otherwise look like a phantom project.
  const showGeneral = general.entries.length > 0 || general.legacyPeriodId !== null;
  const [addGeneralOpen, setAddGeneralOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="from-xqa-blue to-xqa-blue-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg shadow-xqa-blue/25">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My Timesheet</h1>
            <p className="text-muted-foreground text-sm">
              Each project is submitted against its own pay period.
            </p>
          </div>
        </div>
        {!showGeneral && !addGeneralOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddGeneralOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add general time
          </Button>
        ) : null}
      </div>

      {projectSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
          You have no assigned projects yet. Non-project time appears in the General section below.
        </div>
      ) : (
        projectSections.map((section) => (
          // Keying on projectId + periodStart guarantees every Prev/Current/Next
          // click remounts this card with fresh state — the QA bug where the
          // selected Day and period total leaked across periods was `useState`
          // holding onto the previously-mounted period's values.
          <ProjectSectionCard
            key={`${section.projectId}:${section.periodStart}`}
            section={section}
            catalogs={entryCatalogs}
            templates={templates}
            today={today}
          />
        ))
      )}

      {showGeneral || addGeneralOpen ? (
        <GeneralSectionCard general={general} catalogs={entryCatalogs} today={today} />
      ) : null}
    </div>
  );
}

/* ------------------------------- Project section ------------------------------- */

function ProjectSectionCard({
  section,
  catalogs,
  templates,
  today,
}: {
  section: ProjectPeriodSection;
  catalogs: Catalogs;
  templates: Row<"entry_templates">[];
  today: string;
}) {
  const [entries, setEntries] = useState<Entry[]>(section.entries);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startSubmit] = useTransition();
  const router = useRouter();

  // Every total below is scoped to this card's [periodStart, periodEnd] via the
  // pure helpers, and this card is remounted (see key in the parent) whenever
  // the shown period changes, so stale-carry-over across periods is impossible.
  const [selectedDate, setSelectedDate] = useState(() =>
    normalizeSelectedDay(null, section.periodStart, section.periodEnd, today),
  );

  const total = useMemo(
    () => periodTotal(entries, section.periodStart, section.periodEnd),
    [entries, section.periodStart, section.periodEnd],
  );
  const dayHours = useMemo(() => dayTotal(entries, selectedDate), [entries, selectedDate]);
  const weekHours = useMemo(
    () => weekTotalForPeriod(entries, selectedDate, section.periodStart, section.periodEnd),
    [entries, selectedDate, section.periodStart, section.periodEnd],
  );
  const dayEntries = useMemo(
    () => entries.filter((e) => e.entry_date === selectedDate),
    [entries, selectedDate],
  );

  const upsert = (entry: Entry) =>
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === entry.id);
      if (i === -1) return [...prev, entry];
      const next = prev.slice();
      next[i] = entry;
      return next;
    });
  const removeLocal = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  function runSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await submitProjectPeriod(section.projectId, section.periodStart);
      if (res.ok) router.refresh();
      else setSubmitError(res.error);
    });
  }

  return (
    <section className="border-border bg-card rounded-2xl border shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{section.projectName}</h2>
            <StatusBadge status={section.status} />
            {section.source !== "project" ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {section.source === "organization" ? "Org default" : "Legacy weekly"}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {section.periodLabel} · {section.cadenceLabel} ·{" "}
            <span className="font-semibold text-foreground">{fmt(total)}h</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PeriodNav projectId={section.projectId} nav={section.nav} />
          <Button
            type="button"
            size="sm"
            disabled={!section.editable || pending || total === 0}
            onClick={runSubmit}
          >
            <Send className="h-4 w-4" />
            {pending ? "Submitting…" : "Submit period"}
          </Button>
        </div>
      </div>

      {section.status === "rejected" && section.rejectionReason ? (
        <p className="border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-sm text-destructive sm:px-5">
          Changes requested: {section.rejectionReason}
        </p>
      ) : null}
      {!section.editable && section.status !== "rejected" ? (
        <p className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-5">
          <Lock className="h-4 w-4" /> This period is {section.status} and read-only.
        </p>
      ) : null}
      {submitError ? (
        <p className="border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-sm text-destructive sm:px-5">
          {submitError}
        </p>
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard icon={Clock3} label="Day total" value={fmt(dayHours)} tone="brand" />
          <SummaryCard icon={CalendarRange} label="Week total" value={fmt(weekHours)} tone="brand" />
          <SummaryCard
            icon={CalendarClock}
            label={`Pay period · ${section.cadenceLabel}`}
            value={fmt(total)}
            tone="brand"
          />
        </div>

        <DayGrid
          periodStart={section.periodStart}
          periodEnd={section.periodEnd}
          entries={entries}
          selectedDate={selectedDate}
          today={today}
          onSelect={setSelectedDate}
        />

        <div className="mt-4 mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{longDayLabel(selectedDate)}</p>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="hidden sm:inline">Jump to date</span>
            <Input
              type="date"
              className="h-8 w-auto text-xs"
              min={section.periodStart}
              max={section.periodEnd}
              value={selectedDate}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v >= section.periodStart && v <= section.periodEnd) setSelectedDate(v);
              }}
              aria-label="Jump to date"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
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

        {dayEntries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            catalogs={catalogs}
            editable={section.editable}
            onSaved={upsert}
            onRemoved={removeLocal}
          />
        ))}

        {section.editable ? (
          <AddEntryForm
            key={`${section.projectId}:${selectedDate}`}
            weekStart={section.periodStart}
            entryDate={selectedDate}
            catalogs={catalogs}
            lockedProjectId={section.projectId}
            initial={templates[0] ? undefined : undefined}
            onAdded={upsert}
          />
        ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Period-anchored day grid — the primary way to pick a day inside a project
 * pay-period card. Rows follow the ACTUAL period start (not Monday): weekly = 1
 * row × 7, biweekly = 2 rows × 7, semi-monthly/monthly = as many rows as the
 * period spans (final row can be short). Selecting a cell drives the day
 * editor + Day/Week totals below.
 *
 * The horizontal-scroll wrapper is deliberate: on narrow viewports the row
 * scrolls rather than shrinking cells beyond legibility.
 */
function DayGrid({
  periodStart,
  periodEnd,
  entries,
  selectedDate,
  today,
  onSelect,
}: {
  periodStart: string;
  periodEnd: string;
  entries: Entry[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const rows = useMemo(() => chunkPeriodDays(periodStart, periodEnd, 7), [periodStart, periodEnd]);
  const hoursByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.entry_date, (m.get(e.entry_date) ?? 0) + Number(e.hours));
    return m;
  }, [entries]);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, rowIdx) => (
        <div
          key={row[0]}
          className="overflow-x-auto"
          role="row"
          aria-label={`Row ${rowIdx + 1}, ${row[0]} to ${row[row.length - 1]}`}
        >
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(4.75rem, 1fr))` }}
          >
            {row.map((date) => (
              <DayCell
                key={date}
                date={date}
                hours={hoursByDate.get(date) ?? 0}
                selected={date === selectedDate}
                isToday={date === today}
                onClick={() => onSelect(date)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayCell({
  date,
  hours,
  selected,
  isToday,
  onClick,
}: {
  date: string;
  hours: number;
  selected: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  // Two thin lines of context (weekday, date) with a big-tap hour readout.
  // Tenant tokens only: primary/foreground for the picked state, xqa-sky-soft
  // for a subtle hover, ring-primary for the today marker.
  const d = parseISO(date);
  const weekday = format(d, "EEE").toUpperCase();
  const dayLabel = format(d, "MMM d");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "group flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 text-center transition",
        "focus:ring-primary focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-card",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
          : "border-border bg-card hover:bg-xqa-sky-soft hover:border-primary/40",
        !selected && isToday ? "ring-primary/60 ring-1" : null,
        hours === 0 && !selected ? "text-muted-foreground" : null,
      )}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-wide", selected ? "opacity-90" : "text-muted-foreground")}>
        {weekday}
      </span>
      <span className={cn("text-xs font-medium", selected ? "opacity-95" : "text-foreground")}>
        {dayLabel}
      </span>
      <span className={cn("text-sm font-semibold tabular-nums", selected ? "" : hours > 0 ? "text-foreground" : "")}>
        {fmt(hours)}h
      </span>
    </button>
  );
}

function PeriodNav({
  projectId,
  nav,
}: {
  projectId: string;
  nav: ProjectPeriodSection["nav"];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const key = `pp_${projectId}`;

  const hrefFor = (date: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (date === null) next.delete(key);
    else next.set(key, date);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Link href={hrefFor(nav.previous)} className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground">
        Prev
      </Link>
      <Link
        href={hrefFor(null)}
        className={cn(
          "rounded-lg px-3 py-1 text-sm font-semibold",
          nav.isCurrent
            ? "from-xqa-blue to-xqa-blue-2 bg-gradient-to-r text-white"
            : "text-muted-foreground hover:bg-xqa-sky-soft",
        )}
      >
        Current
      </Link>
      <Link href={hrefFor(nav.next)} className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground">
        Next
      </Link>
    </div>
  );
}

/* ------------------------------- General section ------------------------------- */

function GeneralSectionCard({
  general,
  catalogs,
  today,
}: {
  general: GeneralSection;
  catalogs: Catalogs;
  today: string;
}) {
  const [entries, setEntries] = useState<Entry[]>(general.entries);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startSubmit] = useTransition();
  const router = useRouter();

  const week: WeekRange = general.week;
  const [selectedDate, setSelectedDate] = useState(() =>
    normalizeSelectedDay(null, week.start, week.end, today),
  );

  const total = useMemo(() => periodTotal(entries, week.start, week.end), [entries, week.start, week.end]);
  const dayHours = useMemo(() => dayTotal(entries, selectedDate), [entries, selectedDate]);
  const dayEntries = useMemo(
    () => entries.filter((e) => e.entry_date === selectedDate),
    [entries, selectedDate],
  );

  const upsert = (entry: Entry) =>
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === entry.id);
      if (i === -1) return [...prev, entry];
      const next = prev.slice();
      next[i] = entry;
      return next;
    });
  const removeLocal = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  function runSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await submitWeek(week.start);
      if (res.ok) router.refresh();
      else setSubmitError(res.error);
    });
  }

  return (
    <section className="border-border bg-card rounded-2xl border shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">General (no project)</h2>
            <StatusBadge status={general.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {weekRangeLabel(week)} · Weekly ·{" "}
            <span className="font-semibold text-foreground">{fmt(total)}h</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <GeneralNav weekStart={week.start} />
          {total > 0 ? (
            <Button type="button" size="sm" disabled={!general.editable || pending} onClick={runSubmit}>
              <Send className="h-4 w-4" />
              {pending ? "Submitting…" : "Submit week"}
            </Button>
          ) : null}
        </div>
      </div>

      {general.status === "rejected" && general.rejectionReason ? (
        <p className="border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-sm text-destructive sm:px-5">
          Changes requested: {general.rejectionReason}
        </p>
      ) : null}
      {submitError ? (
        <p className="border-b border-destructive/20 bg-destructive/8 px-4 py-2 text-sm text-destructive sm:px-5">
          {submitError}
        </p>
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <SummaryCard icon={Clock3} label="Day total" value={fmt(dayHours)} tone="brand" />
          <SummaryCard icon={CalendarRange} label="Week total" value={fmt(total)} tone="brand" />
        </div>

        <DayGrid
          periodStart={week.start}
          periodEnd={week.end}
          entries={entries}
          selectedDate={selectedDate}
          today={today}
          onSelect={setSelectedDate}
        />

        <div className="mt-4 mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{longDayLabel(selectedDate)}</p>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="hidden sm:inline">Jump to date</span>
            <Input
              type="date"
              className="h-8 w-auto text-xs"
              min={week.start}
              max={week.end}
              value={selectedDate}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v >= week.start && v <= week.end) setSelectedDate(v);
              }}
              aria-label="Jump to date"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
        {dayEntries.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed border-border bg-muted/40 py-4 text-center text-sm">
            No non-project entries for this day.
          </p>
        ) : null}

        {dayEntries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            catalogs={catalogs}
            editable={general.editable}
            onSaved={upsert}
            onRemoved={removeLocal}
          />
        ))}

        {general.editable ? (
          <AddEntryForm
            key={`general:${selectedDate}`}
            weekStart={week.start}
            entryDate={selectedDate}
            catalogs={catalogs}
            onAdded={upsert}
          />
        ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Compact summary tile — same visual language as the old weekly timesheet's
 * SummaryCard, restricted to the tenant brand tone so the panel reads as one
 * coherent surface. The label is a plain text prop so callers can add cadence
 * qualifiers ("Pay period · Biweekly"). Value is *actual* logged hours only —
 * never a target, remaining count, or completion percentage.
 */
function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  tone: "brand";
}) {
  const tones = { brand: "bg-xqa-sky-soft text-xqa-blue" } as const;
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
        <p className="text-xl font-semibold tracking-tight">{value}h</p>
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
    </div>
  );
}

function GeneralNav({ weekStart }: { weekStart: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefFor = (date: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (date === null) next.delete("gw");
    else next.set("gw", date);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
      <Link href={hrefFor(shiftWeek(weekStart, -1))} className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground">
        Prev
      </Link>
      <Link href={hrefFor(null)} className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground">
        Current
      </Link>
      <Link href={hrefFor(shiftWeek(weekStart, 1))} className="hover:bg-xqa-sky-soft rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground">
        Next
      </Link>
    </div>
  );
}
