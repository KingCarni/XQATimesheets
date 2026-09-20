"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { fieldValuesSignature } from "@/lib/pay-periods/calc";
import { saveProjectPayPeriod, type ActionResult } from "@/app/(app)/admin/projects/actions";
import type { ProjectPayPeriodView } from "@/lib/admin/project-pay-periods";
import { PayPeriodFields } from "./pay-period-fields";

const initialState: ActionResult<{ updated: true }> | null = null;

export function ProjectPayPeriod({
  projectId,
  view,
  today,
}: {
  projectId: string;
  view: ProjectPayPeriodView;
  /** Current calendar date in the organization's timezone (yyyy-MM-dd). */
  today: string;
}) {
  const [state, formAction, pending] = useActionState(saveProjectPayPeriod, initialState);
  const [mode, setMode] = useState<"inherit" | "custom">(view.hasOverride ? "custom" : "inherit");
  const [valid, setValid] = useState(true);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <input type="hidden" name="id" value={projectId} />
      <input type="hidden" name="mode" value={mode} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pay period</span>
        <span
          className={
            mode === "custom"
              ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
              : "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
          }
        >
          {mode === "custom" ? "Custom" : "Inherited"}
        </span>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="radio"
            name="modeChoice"
            checked={mode === "inherit"}
            onChange={() => setMode("inherit")}
          />
          Use organization default
        </label>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="radio"
            name="modeChoice"
            checked={mode === "custom"}
            onChange={() => setMode("custom")}
          />
          Use custom pay period
        </label>
      </div>

      {mode === "inherit" ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Using organization default
          </p>
          <p className="mt-1 font-medium">{view.orgSummary}</p>
          <p className="text-muted-foreground">Current: {view.orgCurrentLabel}</p>
        </div>
      ) : (
        <PayPeriodFields
          key={fieldValuesSignature(view.formDefaults)}
          today={today}
          onValidChange={setValid}
          initial={view.formDefaults}
        />
      )}

      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">Saved.</p> : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || (mode === "custom" && !valid)}>
          {pending ? "Saving…" : "Save pay period"}
        </Button>
      </div>
    </form>
  );
}
