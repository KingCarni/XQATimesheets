"use client";

import { useActionState, useId, useState } from "react";
import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";

import {
  deleteEmployee,
  resetEmployeePassword,
  updateEmployee,
  type ActionResult,
  type ResetPasswordResult,
} from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AdminEmployeeDto } from "@/lib/admin/employees";
import {
  ProjectAssignmentPicker,
  type AdminProject,
  type ProjectAssignmentValue,
} from "./project-assignment-picker";

const updateInitialState: ActionResult<{ updated: true }> | null = null;
const resetInitialState: ActionResult<ResetPasswordResult> | null = null;
const deleteInitialState: ActionResult<{ deleted: true }> | null = null;

const VISIBLE_PROJECT_SUMMARY = 2;

export function EmployeeCard({
  user,
  projects,
}: {
  user: AdminEmployeeDto;
  projects: AdminProject[];
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  const [updateState, updateAction, updatePending] = useActionState(
    updateEmployee,
    updateInitialState,
  );

  const [resetState, resetAction, resetPending] = useActionState(
    resetEmployeePassword,
    resetInitialState,
  );

  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteEmployee,
    deleteInitialState,
  );

  const assignments = user.employee_profile?.project_assignments ?? [];
  const initialAssignments: ProjectAssignmentValue[] = assignments.map((assignment) => ({
    projectId: assignment.project_id,
    role: assignment.assignment_role,
  }));

  const displayName = user.employee_profile?.full_name ?? user.email;
  const visibleAssignments = assignments.slice(0, VISIBLE_PROJECT_SUMMARY);
  const extraAssignments = assignments.length - visibleAssignments.length;
  const projectSummary =
    assignments.length === 0
      ? "No active projects"
      : visibleAssignments
          .map((a) => `${a.project.name} (${a.assignment_role})`)
          .join(", ") + (extraAssignments > 0 ? `, +${extraAssignments} more` : "");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left transition hover:bg-muted/40"
      >
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{displayName}</h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="capitalize">{user.role}</span>
            {" · "}
            <span className={user.is_active ? "text-success" : "text-destructive"}>
              {user.is_active ? "Active" : "Inactive"}
            </span>
            {" · "}
            {assignments.length} project{assignments.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{projectSummary}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm">
          {expanded ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Collapse
            </>
          ) : (
            <>
              <ChevronRight className="h-3.5 w-3.5" /> Expand
            </>
          )}
        </span>
      </button>

      <div id={contentId} hidden={!expanded} className="border-t border-border p-5 pt-4">
        {updateState && !updateState.ok ? (
          <p className="mb-3 rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {updateState.error}
          </p>
        ) : null}

        {updateState?.ok ? (
          <p className="mb-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Saved.
          </p>
        ) : null}

        <form action={updateAction} className="grid gap-5">
          <input type="hidden" name="userId" value={user.id} />

          <div className="grid gap-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Employee Details</h3>
            <div className="grid gap-3 lg:grid-cols-4">
              <Input
                name="fullName"
                defaultValue={user.employee_profile?.full_name ?? ""}
                placeholder="Full name"
                required
              />

              <Input
                name="employeeCode"
                defaultValue={user.employee_profile?.employee_code ?? ""}
                placeholder="Employee code"
              />

              <Input
                name="department"
                defaultValue={user.employee_profile?.department ?? ""}
                placeholder="Department"
              />

              <Select name="role" defaultValue={user.role} aria-label="Account role">
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Select>

              <Input
                name="timezone"
                defaultValue={user.employee_profile?.timezone ?? "America/Vancouver"}
                placeholder="Timezone"
              />

              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="isActive" defaultChecked={user.is_active} />
                Active
              </label>
            </div>
          </div>

          <div className="grid gap-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Project Assignments</h3>
            <ProjectAssignmentPicker projects={projects} initialAssignments={initialAssignments} />
          </div>

          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving…" : "Save Employee"}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <form action={resetAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={user.id} />

            <Button type="submit" variant="outline" disabled={resetPending}>
              {resetPending ? "Resetting…" : "Reset Password"}
            </Button>

            {resetState && !resetState.ok ? (
              <span className="text-sm text-destructive">{resetState.error}</span>
            ) : null}

            {resetState?.ok ? (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <KeyRound className="h-4 w-4 shrink-0" />
                New temporary password (shown once):{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                  {resetState.data.temporaryPassword}
                </code>
              </span>
            ) : null}
          </form>

          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={user.id} />
            <Button
              type="submit"
              variant="destructive"
              disabled={deletePending}
              onClick={(e) => {
                if (
                  !window.confirm(
                    `Permanently delete ${displayName}'s account? This cannot be undone. Employees with any historical records will be refused automatically — deactivate them instead.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              {deletePending ? "Deleting…" : "Delete User"}
            </Button>
            {deleteState && !deleteState.ok ? (
              <span className="text-sm text-destructive">{deleteState.error}</span>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
