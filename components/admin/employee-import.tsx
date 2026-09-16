"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, Download, KeyRound, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  parseEmployeeImport,
  commitEmployeeImport,
  type ActionResult,
} from "@/app/(app)/admin/import-actions";
import type { ImportCommitResult } from "@/app/(app)/admin/import-actions";
import type { ImportPreview } from "@/lib/admin/import";

export function EmployeeImport() {
  const [open, setOpen] = useState(false);
  const [previewState, previewAction, previewPending] = useActionState<ActionResult<ImportPreview> | null, FormData>(
    parseEmployeeImport,
    null,
  );
  const [commitState, commitAction, commitPending] = useActionState<ActionResult<ImportCommitResult> | null, FormData>(
    commitEmployeeImport,
    null,
  );

  const preview = previewState?.ok ? previewState.data : null;
  const importable =
    preview?.rows
      .filter((r) => r.status !== "error" && r.matchedProjectId)
      .map((r) => ({
        name: r.name,
        email: r.email,
        employeeCode: r.employeeCode || null,
        projectId: r.matchedProjectId,
      })) ?? [];
  const result = commitState?.ok ? commitState.data : null;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left transition hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-lg font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Import employees from Excel
        </span>
        <span className="text-xs text-muted-foreground">.xlsx · Name, Email, Project, Employee ID</span>
      </button>

      {open ? (
        <div className="grid gap-4 border-t border-border p-5">
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/admin/import-template">
              <Button type="button" variant="outline" size="sm">
                <Download className="h-4 w-4" />
                Download template
              </Button>
            </a>
            <p className="text-xs text-muted-foreground">
              Columns in order: Name, Email, Project, Employee ID. The first row may be headers.
            </p>
          </div>

          <form action={previewAction} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3">
            <input
              type="file"
              name="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs"
            />
            <Button type="submit" size="sm" disabled={previewPending}>
              <Upload className="h-4 w-4" />
              {previewPending ? "Reading…" : "Preview"}
            </Button>
            {previewState && !previewState.ok ? (
              <span className="text-xs text-destructive">{previewState.error}</span>
            ) : null}
          </form>

          {preview ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Count label="Ready" value={preview.counts.ready} tone="success" />
                <Count label="Warnings" value={preview.counts.warning} tone="warning" />
                <Count label="Errors" value={preview.counts.error} tone="destructive" />
                <Count label="Total" value={preview.counts.total} tone="muted" />
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Employee ID</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.name || "—"}</td>
                        <td className="px-3 py-2">{row.email || "—"}</td>
                        <td className="px-3 py-2">{row.project || "—"}</td>
                        <td className="px-3 py-2">{row.employeeCode || "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status === "ready" ? "approved" : row.status === "warning" ? "requested" : "rejected"} />
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.messages.join(" ") || "OK"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form action={commitAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="rows" value={JSON.stringify(importable)} />
                <Button type="submit" disabled={commitPending || importable.length === 0}>
                  {commitPending ? "Importing…" : `Confirm import (${importable.length})`}
                </Button>
                {preview.counts.error > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {preview.counts.error} row(s) with errors will be skipped.
                  </span>
                ) : null}
                {commitState && !commitState.ok ? (
                  <span className="text-xs text-destructive">{commitState.error}</span>
                ) : null}
              </form>
            </div>
          ) : null}

          {result ? (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Count label="Imported" value={result.counts.imported} tone="success" />
                <Count label="Skipped" value={result.counts.skipped} tone="warning" />
                <Count label="Failed" value={result.counts.failed} tone="destructive" />
              </div>

              {result.imported.length > 0 ? (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-success">
                    <KeyRound className="h-4 w-4" />
                    Temporary passwords (shown once — share out of band)
                  </p>
                  <div className="grid gap-1 text-sm">
                    {result.imported.map((u) => (
                      <div key={u.email} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5">
                        <span>
                          {u.fullName} <span className="text-muted-foreground">({u.email})</span>
                        </span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{u.temporaryPassword}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.skipped.length > 0 ? (
                <div className="text-sm">
                  <p className="font-semibold text-warning">Skipped</p>
                  {result.skipped.map((s) => (
                    <p key={s.email} className="text-muted-foreground">
                      {s.email} — {s.reason}
                    </p>
                  ))}
                </div>
              ) : null}

              {result.failed.length > 0 ? (
                <div className="text-sm">
                  <p className="font-semibold text-destructive">Failed</p>
                  {result.failed.map((f) => (
                    <p key={f.email} className="text-muted-foreground">
                      {f.email} — {f.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "destructive" | "muted" }) {
  const tones: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${tones[tone]}`}>
      {value} <span className="font-normal">{label}</span>
    </span>
  );
}
