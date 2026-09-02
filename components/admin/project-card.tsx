"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProject, deleteProject, type ActionResult } from "@/app/(app)/admin/projects/actions";
import type { AdminProjectRow } from "@/lib/admin/projects";

const updateInitialState: ActionResult<{ updated: true }> | null = null;
const deleteInitialState: ActionResult<{ deleted: true }> | null = null;

export function ProjectCard({ project }: { project: AdminProjectRow }) {
  const [updateState, updateAction, updatePending] = useActionState(updateProject, updateInitialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteProject, deleteInitialState);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <p className="text-sm text-muted-foreground">
            {project.is_active ? "Active" : "Inactive"} · Requires platform: {project.requires_platform ? "Yes" : "No"} ·{" "}
            {project.assignmentCount} assignment{project.assignmentCount === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={
            project.is_active
              ? "rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success"
              : "rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"
          }
        >
          {project.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      {updateState && !updateState.ok ? (
        <p className="mb-3 rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {updateState.error}
        </p>
      ) : null}
      {updateState?.ok ? (
        <p className="mb-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">Saved.</p>
      ) : null}

      <form action={updateAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={project.id} />
        <Input name="name" defaultValue={project.name} required className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="requiresPlatform" defaultChecked={project.requires_platform} />
          Requires Platform
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="isActive" defaultChecked={project.is_active} />
          Active
        </label>
        <Button type="submit" size="sm" disabled={updatePending}>
          {updatePending ? "Saving…" : "Save"}
        </Button>
      </form>

      <form action={deleteAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <input type="hidden" name="id" value={project.id} />
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={deletePending}
          onClick={(e) => {
            if (
              !window.confirm(
                `Delete "${project.name}"? This permanently removes the project and cannot be undone. Projects with any references will be refused automatically.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          {deletePending ? "Deleting…" : "Delete"}
        </Button>
        {deleteState && !deleteState.ok ? (
          <span className="text-sm text-destructive">{deleteState.error}</span>
        ) : null}
      </form>
    </div>
  );
}
