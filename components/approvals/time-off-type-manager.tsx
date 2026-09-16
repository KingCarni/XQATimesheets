"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTimeOffType,
  updateTimeOffType,
  type ActionResult,
} from "@/app/(app)/approvals/time-off-type-actions";

export type TimeOffTypeDto = { id: string; name: string; category: string | null; isActive: boolean };

export function TimeOffTypeManager({ types }: { types: TimeOffTypeDto[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left transition hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Manage time-off types
        </span>
        <span className="text-xs text-muted-foreground">{types.length} configured</span>
      </button>

      {open ? (
        <div className="grid gap-3 border-t border-border p-4">
          <div className="grid gap-2">
            {types.map((type) => (
              <TypeRow key={type.id} type={type} />
            ))}
          </div>
          <CreateTypeForm />
        </div>
      ) : null}
    </div>
  );
}

function TypeRow({ type }: { type: TimeOffTypeDto }) {
  const [state, action, pending] = useActionState<ActionResult<{ updated: true }> | null, FormData>(
    updateTimeOffType,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
      <input type="hidden" name="id" value={type.id} />
      <input type="hidden" name="category" value={type.category ?? "pto"} />
      <Input name="name" defaultValue={type.name} className="min-w-48 flex-1" aria-label="Type name" />
      <label className="flex items-center gap-1.5 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={type.isActive} />
        Active
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-success">Saved</span> : null}
    </form>
  );
}

function CreateTypeForm() {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createTimeOffType,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-2.5">
      <Input name="name" placeholder="New type name (e.g. Bereavement)" className="min-w-48 flex-1" required />
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? "Adding…" : "Add type"}
      </Button>
      {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-success">Added</span> : null}
    </form>
  );
}
