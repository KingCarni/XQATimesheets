/**
 * A period reference used by the approvals UI/actions. During the MHV-8
 * transition the queue contains two kinds of submission unit:
 *   - "project" → a `project_timesheet_periods` row (the operational unit), and
 *   - "legacy"  → a historical `timesheet_periods` (weekly) row.
 * We encode the kind into the id string so a single `periodId` form field can
 * carry both, and approve/reject can route to the correct table.
 */
export type PeriodKind = "project" | "legacy";

export function encodePeriodRef(kind: PeriodKind, id: string): string {
  return `${kind}:${id}`;
}

export function decodePeriodRef(ref: string): { kind: PeriodKind; id: string } {
  const idx = ref.indexOf(":");
  if (idx === -1) return { kind: "legacy", id: ref }; // pre-MHV-8 bare ids
  const kind = ref.slice(0, idx);
  return { kind: kind === "project" ? "project" : "legacy", id: ref.slice(idx + 1) };
}
