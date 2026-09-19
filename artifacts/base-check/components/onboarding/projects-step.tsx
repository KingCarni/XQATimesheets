"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject, type ActionResult } from "@/app/(app)/admin/projects/actions";
import { continueToTeamStep } from "@/app/(onboarding)/onboarding/actions";
import type { AdminProjectRow } from "@/lib/admin/projects";

const initial: ActionResult<{ id: string }> | null = null;

export function ProjectsStep({ projects }: { projects: AdminProjectRow[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createProject, initial);

  // Refresh the server-rendered list after a successful add.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Add the projects your team logs time against. You can always add more later, and importing
        employees can detect projects by name.
      </p>

      <form key={state?.ok ? state.data.id : "add"} action={formAction} className="flex flex-wrap items-center gap-3">
        <Input name="name" placeholder="Project name" required className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="requiresPlatform" />
          Requires platform
        </label>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Adding…" : "Add project"}
        </Button>
        {state && !state.ok ? <span className="text-destructive text-sm">{state.error}</span> : null}
      </form>

      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
          Projects ({projects.length})
        </div>
        {projects.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground text-xs">
                  {p.requires_platform ? "Requires platform" : "No platform"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <form action={continueToTeamStep}>
          <Button type="submit" disabled={projects.length === 0}>
            Continue
          </Button>
        </form>
      </div>
      {projects.length === 0 ? (
        <p className="text-right text-xs text-muted-foreground">Add at least one project to continue.</p>
      ) : null}
    </div>
  );
}
