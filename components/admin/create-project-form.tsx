"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, type ActionResult } from "@/app/(app)/admin/projects/actions";

const initialState: ActionResult<{ id: string }> | null = null;

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initialState);
  const formKey = state?.ok ? state.data.id : "add-project";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 text-lg font-semibold">Add Project</h2>

      {state?.ok ? (
        <p className="mb-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Project created.
        </p>
      ) : null}
      {state && !state.ok ? (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <form key={formKey} action={formAction} className="flex flex-wrap items-center gap-3">
        <Input name="name" placeholder="Project name" required className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="requiresPlatform" />
          Requires Platform
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add Project"}
        </Button>
      </form>
    </section>
  );
}
