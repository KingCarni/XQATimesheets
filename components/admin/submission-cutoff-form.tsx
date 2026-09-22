"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { saveSubmissionCutoffSettings, type SettingsState } from "@/app/(app)/admin/settings/actions";

const initial: SettingsState = { error: null, ok: false };

/**
 * MHV-4 admin form. Persists cutoff to organization; when disabled, the app
 * ignores cutoffs entirely (no due-by badges, no sweep notifications).
 */
export function SubmissionCutoffForm({
  enabled: enabledInitial,
  offsetDays,
  timeLocal,
  timezone,
}: {
  enabled: boolean;
  offsetDays: number | null;
  timeLocal: string | null;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(saveSubmissionCutoffSettings, initial);
  const [enabled, setEnabled] = useState(enabledInitial);
  const [offset, setOffset] = useState(offsetDays ?? 1);
  const [time, setTime] = useState(timeLocal ?? "12:00");

  const previewLabel = enabled
    ? `Example: a period ending Sunday is due ${offset === 0 ? "the same day" : `${offset} day${offset === 1 ? "" : "s"} later`} at ${time} (${timezone}).`
    : "Cutoffs are disabled. Employees will not see a due-by badge or receive reminders.";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="font-medium">Enable submission cutoff</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">Due — days after period end</span>
          <input
            type="number"
            name="offsetDays"
            min={0}
            max={14}
            step={1}
            value={offset}
            disabled={!enabled}
            onChange={(e) => setOffset(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          <span className="text-muted-foreground">At (local {timezone})</span>
          <input
            type="time"
            name="timeLocal"
            value={time}
            disabled={!enabled}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
          />
        </label>
      </div>

      <p className="text-xs text-muted-foreground">{previewLabel}</p>

      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : state.ok ? (
        <p className="text-success text-sm">Cutoff settings saved.</p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save cutoff settings"}
        </Button>
      </div>
    </form>
  );
}
