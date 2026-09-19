"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { editEntry, removeEntry } from "@/app/(app)/my-timesheet/actions";
import type { Row } from "@/types/database";

type Entry = Row<"time_entries">;

export type Catalogs = {
  projects: Row<"projects">[];
  platforms: Row<"platforms">[];
  activityTypes: Row<"activity_types">[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function EntryRow({
  entry,
  catalogs,
  editable,
  onSaved,
  onRemoved,
}: {
  entry: Entry;
  catalogs: Catalogs;
  editable: boolean;
  onSaved: (e: Entry) => void;
  onRemoved: (id: string) => void;
}) {
  const [projectId, setProjectId] = useState<string>(entry.project_id ?? "");
  const [platformId, setPlatformId] = useState<string>(entry.platform_id ?? "");
  const [activityId, setActivityId] = useState<string>(entry.activity_type_id);
  const [hours, setHours] = useState<string>(String(entry.hours));
  const [description, setDescription] = useState<string>(entry.description ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedProject = catalogs.projects.find((p) => p.id === projectId);
  const platformRequired = Boolean(selectedProject?.requires_platform) && platformId === "";

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function scheduleSave(next: {
    projectId?: string;
    platformId?: string;
    activityId?: string;
    hours?: string;
    description?: string;
  }) {
    if (!editable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const parsedHours = Number(next.hours ?? hours);
      if (!Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
        setState("error");
        setError("Hours must be between 0 and 24");
        return;
      }
      setState("saving");
      setError(null);
      startTransition(async () => {
        const res = await editEntry({
          id: entry.id,
          projectId: (next.projectId ?? projectId) || null,
          platformId: (next.platformId ?? platformId) || null,
          activityTypeId: next.activityId ?? activityId,
          hours: parsedHours,
          description: next.description ?? description,
        });
        if (res.ok) {
          setState("saved");
          onSaved(res.data);
          setTimeout(() => setState("idle"), 1500);
        } else {
          setState("error");
          setError(res.error);
        }
      });
    }, 600);
  }

  function handleRemove() {
    if (!editable) return;
    startTransition(async () => {
      const res = await removeEntry(entry.id);
      if (res.ok) onRemoved(entry.id);
      else {
        setState("error");
        setError(res.error);
      }
    });
  }

  return (
    <div className="grid min-w-[880px] grid-cols-[1.4fr_1fr_1.4fr_0.6fr_2fr_auto] items-center gap-2 border-b border-border py-2.5 lg:min-w-0">
      <Select
        value={projectId}
        disabled={!editable}
        onChange={(e) => {
          setProjectId(e.target.value);
          scheduleSave({ projectId: e.target.value });
        }}
      >
        <option value="">— No project —</option>
        {catalogs.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <div>
        <Select
          value={platformId}
          disabled={!editable}
          onChange={(e) => {
            setPlatformId(e.target.value);
            scheduleSave({ platformId: e.target.value });
          }}
          className={cn(platformRequired && "border-warning")}
        >
          <option value="">—</option>
          {catalogs.platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {platformRequired ? (
          <p className="text-warning mt-1 text-xs">Platform required</p>
        ) : null}
      </div>

      <Select
        value={activityId}
        disabled={!editable}
        onChange={(e) => {
          setActivityId(e.target.value);
          scheduleSave({ activityId: e.target.value });
        }}
      >
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
        value={hours}
        disabled={!editable}
        aria-label="Hours"
        className="text-right"
        onChange={(e) => {
          setHours(e.target.value);
          scheduleSave({ hours: e.target.value });
        }}
      />

      <Input
        value={description}
        disabled={!editable}
        placeholder="Description"
        aria-label="Description"
        onChange={(e) => {
          setDescription(e.target.value);
          scheduleSave({ description: e.target.value });
        }}
      />

      <div className="flex items-center gap-2">
        <StatusDot state={state} title={error ?? undefined} />
        {editable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Delete entry"
            onClick={handleRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StatusDot({ state, title }: { state: SaveState; title?: string }) {
  const map: Record<SaveState, { color: string; label: string }> = {
    idle: { color: "bg-transparent", label: "" },
    saving: { color: "bg-warning", label: "Saving…" },
    saved: { color: "bg-success", label: "Saved" },
    error: { color: "bg-destructive", label: title ?? "Error" },
  };
  const { color, label } = map[state];
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs" title={title}>
      <span className={cn("inline-block h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}
