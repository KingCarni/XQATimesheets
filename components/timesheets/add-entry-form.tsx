"use client";

import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { addEntry } from "@/app/(app)/my-timesheet/actions";
import type { Row } from "@/types/database";
import type { Catalogs } from "./entry-row";
import type { DateStr } from "@/lib/timesheets/week";

type Entry = Row<"time_entries">;

export type EntryPrefill = {
  projectId?: string;
  platformId?: string;
  activityId?: string;
  description?: string;
};

export function AddEntryForm({
  weekStart,
  entryDate,
  catalogs,
  initial,
  onAdded,
}: {
  weekStart: DateStr;
  entryDate: DateStr;
  catalogs: Catalogs;
  initial?: EntryPrefill;
  onAdded: (e: Entry) => void;
}) {
  const firstActivity = catalogs.activityTypes[0]?.id ?? "";
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [platformId, setPlatformId] = useState(initial?.platformId ?? "");
  const [activityId, setActivityId] = useState(initial?.activityId ?? firstActivity);
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedProject = catalogs.projects.find((p) => p.id === projectId);
  const platformRequired = Boolean(selectedProject?.requires_platform) && platformId === "";

  function reset(keepContext: boolean) {
    setHours("");
    setDescription("");
    if (!keepContext) {
      setProjectId("");
      setPlatformId("");
      setActivityId(firstActivity);
    }
  }

  function submit(addAnother: boolean) {
    setError(null);
    if (!activityId) {
      setError("Select a work type");
      return;
    }
    const parsedHours = Number(hours);
    if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      setError("Enter hours between 0 and 24");
      return;
    }
    startTransition(async () => {
      const res = await addEntry({
        weekStart,
        entryDate,
        projectId: projectId || null,
        platformId: platformId || null,
        activityTypeId: activityId,
        hours: parsedHours,
        description,
      });
      if (res.ok) {
        onAdded(res.data);
        reset(addAnother);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-3 min-w-[880px] rounded-xl border border-dashed border-border bg-muted/45 p-3 lg:min-w-0">
      <div className="grid grid-cols-[1.4fr_1fr_1.4fr_0.6fr_2fr] gap-2">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— No project —</option>
          {catalogs.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
          className={cn(platformRequired && "border-warning")}
        >
          <option value="">—</option>
          {catalogs.platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
          {catalogs.activityTypes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={0}
          max={24}
          step={0.25}
          placeholder="0.0"
          className="text-right"
          aria-label="Hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <Input
          placeholder="Description"
          aria-label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => submit(false)}>
          Save Entry
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => submit(true)}
        >
          Save + Add Another
        </Button>
        {platformRequired ? (
          <span className="text-warning text-xs">Platform required for this project</span>
        ) : null}
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  );
}
