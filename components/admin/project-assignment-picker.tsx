"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export type AdminProject = { id: string; name: string };
export type AssignmentRole = "member" | "lead" | "manager";
export type ProjectAssignmentValue = { projectId: string; role: AssignmentRole };

const ROLE_LABELS: Record<AssignmentRole, string> = {
  member: "Member",
  lead: "Lead",
  manager: "Manager",
};
const ROLES = Object.keys(ROLE_LABELS) as AssignmentRole[];

/**
 * Compact project-assignment builder shared by Create/Edit Employee.
 *
 * Renders one "add project" selector plus one row per CURRENTLY assigned
 * project — never one control per available project, so it stays usable
 * with 100+ projects. State lives entirely on the client; nothing is
 * persisted until the surrounding form is submitted. Each assignment is
 * serialized as a hidden `<input name="assignment" value="projectId:role">`
 * so the existing server action's `readAssignments(formData)` parsing needs
 * no changes.
 */
export function ProjectAssignmentPicker({
  projects,
  initialAssignments = [],
  fieldName = "assignment",
}: {
  projects: AdminProject[];
  initialAssignments?: ProjectAssignmentValue[];
  fieldName?: string;
}) {
  const [assignments, setAssignments] = useState<ProjectAssignmentValue[]>(initialAssignments);
  const [pendingProjectId, setPendingProjectId] = useState("");
  const [addError, setAddError] = useState(false);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.projectId)), [assignments]);
  const available = useMemo(() => projects.filter((p) => !assignedIds.has(p.id)), [projects, assignedIds]);

  function addProject() {
    if (!pendingProjectId) {
      setAddError(true);
      return;
    }
    setAssignments((prev) =>
      prev.some((a) => a.projectId === pendingProjectId)
        ? prev
        : [...prev, { projectId: pendingProjectId, role: "member" }],
    );
    setPendingProjectId("");
    setAddError(false);
  }

  function removeProject(projectId: string) {
    setAssignments((prev) => prev.filter((a) => a.projectId !== projectId));
  }

  function setRole(projectId: string, role: AssignmentRole) {
    setAssignments((prev) => prev.map((a) => (a.projectId === projectId ? { ...a, role } : a)));
  }

  return (
    <div className="grid gap-3">
      {assignments.map((a) => (
        <input key={a.projectId} type="hidden" name={fieldName} value={`${a.projectId}:${a.role}`} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={pendingProjectId}
          onChange={(e) => {
            setPendingProjectId(e.target.value);
            setAddError(false);
          }}
          className="max-w-xs"
          aria-label="Select a project to add"
          disabled={available.length === 0}
        >
          <option value="">{available.length ? "Select project..." : "No more projects to add"}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={addProject} disabled={available.length === 0}>
          Add Project
        </Button>
        {addError ? <span className="text-xs text-destructive">Select a project first.</span> : null}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
          Project Assignments ({assignments.length})
        </p>

        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project assignments yet.</p>
        ) : (
          <div className="grid gap-2">
            {assignments.map((a) => (
              <div
                key={a.projectId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="text-sm font-medium">{projectById.get(a.projectId) ?? "Unknown project"}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Project Role
                    <Select
                      value={a.role}
                      onChange={(e) => setRole(a.projectId, e.target.value as AssignmentRole)}
                      className="h-8 w-28"
                      aria-label={`Project role for ${projectById.get(a.projectId) ?? "project"}`}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeProject(a.projectId)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
