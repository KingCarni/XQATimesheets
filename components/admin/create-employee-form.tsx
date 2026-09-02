"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createEmployee,
  type ActionResult,
  type CreateEmployeeResult,
} from "@/app/(app)/admin/actions";
import {
  ProjectAssignmentPicker,
  type AdminProject,
} from "./project-assignment-picker";

const initialState: ActionResult<CreateEmployeeResult> | null = null;

export function CreateEmployeeForm({
  projects,
}: {
  projects: AdminProject[];
}) {
  const [state, formAction, pending] = useActionState(
    createEmployee,
    initialState,
  );

  const formKey = state?.ok ? state.data.email : "add";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 text-lg font-semibold">Add Employee</h2>

      {state?.ok ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span>
            Created <strong>{state.data.fullName}</strong> ({state.data.email}).
            Temporary password (shown once):{" "}
            <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono text-foreground">
              {state.data.temporaryPassword}
            </code>
          </span>
        </div>
      ) : null}

      {state && !state.ok ? (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <form key={formKey} action={formAction} className="grid gap-5">
        <div className="grid gap-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Employee Details</h3>
          <div className="grid gap-3 lg:grid-cols-4">
            <Input name="fullName" placeholder="Full name" required />

            <Input name="email" type="email" placeholder="Email" required />

            <Select name="role" defaultValue="employee" aria-label="Account role">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>

            <Input name="employeeCode" placeholder="Employee code" />

            <Input name="department" placeholder="Department" />

            <Input name="timezone" defaultValue="America/Vancouver" placeholder="Timezone" />
          </div>
        </div>

        <div className="grid gap-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Project Assignments</h3>
          <ProjectAssignmentPicker projects={projects} />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create Employee"}
        </Button>
      </form>

      <p className="mt-2 text-xs text-muted-foreground">
        A temporary password is generated automatically and shown once above —
        share it with the employee out of band. It is never stored in plaintext.
      </p>
    </section>
  );
}
