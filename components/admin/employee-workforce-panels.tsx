"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Pencil, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarList } from "@/components/charts/bar-list";
import {
  createContract,
  updateContract,
  uploadContractAttachment,
  createEquipment,
  updateEquipment,
  setLeaveEntitlement,
  type ActionResult,
} from "@/app/(app)/admin/workforce-actions";
import type { EmployeeWorkforce } from "@/lib/admin/workforce";

export function EmployeeWorkforcePanels({
  profileId,
  workforce,
  ptoTypes,
}: {
  profileId: string;
  workforce: EmployeeWorkforce;
  ptoTypes: { id: string; name: string }[];
}) {
  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Workforce</h3>
      <Panel title="Time-off balances" defaultOpen>
        <BalancesPanel profileId={profileId} workforce={workforce} ptoTypes={ptoTypes} />
      </Panel>
      <Panel title="Contracts" count={workforce.contracts.length}>
        <ContractsPanel profileId={profileId} workforce={workforce} />
      </Panel>
      <Panel title="Equipment" count={workforce.equipment.length}>
        <EquipmentPanel profileId={profileId} workforce={workforce} />
      </Panel>
      <Panel title="Analytics">
        <AnalyticsPanel workforce={workforce} />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold transition hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {title}
          {typeof count === "number" ? <span className="text-xs text-muted-foreground">({count})</span> : null}
        </span>
      </button>
      {open ? <div className="border-t border-border p-4">{children}</div> : null}
    </div>
  );
}

/* ------------------------------ Balances ------------------------------ */

function BalancesPanel({
  profileId,
  workforce,
  ptoTypes,
}: {
  profileId: string;
  workforce: EmployeeWorkforce;
  ptoTypes: { id: string; name: string }[];
}) {
  const hoursByType = new Map(workforce.entitlements.map((e) => [e.activityTypeId, e]));
  if (ptoTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">No active time-off types are configured.</p>;
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Set entitlement hours per leave type. Leave blank to clear. This is a flat allotment, not an accrual.
      </p>
      {ptoTypes.map((type) => (
        <EntitlementRow
          key={type.id}
          profileId={profileId}
          type={type}
          current={hoursByType.get(type.id) ?? null}
        />
      ))}
    </div>
  );
}

function EntitlementRow({
  profileId,
  type,
  current,
}: {
  profileId: string;
  type: { id: string; name: string };
  current: { hours: number; note: string | null } | null;
}) {
  const [state, action, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    setLeaveEntitlement,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
      <input type="hidden" name="employeeProfileId" value={profileId} />
      <input type="hidden" name="activityTypeId" value={type.id} />
      <span className="min-w-32 flex-1 text-sm font-medium">{type.name}</span>
      <Input
        name="hours"
        type="number"
        min="0"
        step="0.25"
        placeholder="Hours"
        defaultValue={current ? String(current.hours) : ""}
        className="w-28"
        aria-label={`${type.name} entitlement hours`}
      />
      <Input name="note" placeholder="Note (optional)" defaultValue={current?.note ?? ""} className="min-w-40 flex-1" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-success">Saved</span> : null}
    </form>
  );
}

/* ------------------------------ Contracts ----------------------------- */

const CONTRACT_STATUSES = ["upcoming", "active", "expired", "terminated"] as const;

function ContractsPanel({ profileId, workforce }: { profileId: string; workforce: EmployeeWorkforce }) {
  return (
    <div className="grid gap-3">
      {workforce.contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contracts yet.</p>
      ) : (
        workforce.contracts.map((c) => (
          <div key={c.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.title}</span>
                {c.isCurrent ? (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Current</span>
                ) : null}
              </div>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {c.contractType ? `${c.contractType} · ` : ""}
              {c.startDate} → {c.endDate ?? "ongoing"}
            </p>
            {c.attachments.length > 0 ? (
              <div className="mt-2 grid gap-1">
                {c.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/contracts/attachments/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 text-sm text-xqa-blue hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {a.originalFilename}
                  </a>
                ))}
              </div>
            ) : null}
            <ContractActions contract={c} />
          </div>
        ))
      )}
      <CreateContractForm profileId={profileId} />
    </div>
  );
}

/**
 * Contract action row: two clearly styled buttons that each reveal a panel.
 * Replaces the old plain-text "Edit metadata" link so it reads as an action.
 */
function ContractActions({ contract }: { contract: EmployeeWorkforce["contracts"][number] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={editOpen ? "default" : "outline"}
          onClick={() => setEditOpen((v) => !v)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit metadata
        </Button>
        <Button
          type="button"
          size="sm"
          variant={uploadOpen ? "default" : "outline"}
          onClick={() => setUploadOpen((v) => !v)}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload PDF
        </Button>
      </div>
      {editOpen ? <EditContractFields contract={contract} /> : null}
      {uploadOpen ? <UploadAttachmentFields contractId={contract.id} /> : null}
    </div>
  );
}

function EditContractFields({ contract }: { contract: EmployeeWorkforce["contracts"][number] }) {
  const [state, action, pending] = useActionState<ActionResult<{ updated: true }> | null, FormData>(
    updateContract,
    null,
  );
  return (
    <form action={action} className="mt-3 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2">
      <input type="hidden" name="contractId" value={contract.id} />
      <Input name="title" defaultValue={contract.title} placeholder="Title" required />
      <Input name="contractType" defaultValue={contract.contractType ?? ""} placeholder="Type (e.g. Full-time)" />
      <Input name="startDate" type="date" defaultValue={contract.startDate} required aria-label="Start date" />
      <Input name="endDate" type="date" defaultValue={contract.endDate ?? ""} aria-label="End date" />
      <Select name="status" defaultValue={contract.status} aria-label="Status">
        {CONTRACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Input name="notes" defaultValue={contract.notes ?? ""} placeholder="Notes" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save contract"}
        </Button>
        {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-xs text-success">Saved</span> : null}
      </div>
    </form>
  );
}

function UploadAttachmentFields({ contractId }: { contractId: string }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    uploadContractAttachment,
    null,
  );
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <input
        type="hidden"
        name="contractId"
        value={contractId}
      />
      <input
        type="file"
        name="file"
        accept="application/pdf"
        required
        className="text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs"
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Upload className="h-3.5 w-3.5" />
        {pending ? "Uploading…" : "Upload PDF"}
      </Button>
      {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-success">Uploaded</span> : null}
    </form>
  );
}

function CreateContractForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createContract,
    null,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3 sm:grid-cols-2">
      <input type="hidden" name="employeeProfileId" value={profileId} />
      <Input name="title" placeholder="Contract title" required />
      <Input name="contractType" placeholder="Type (e.g. Full-time)" />
      <Input name="startDate" type="date" required aria-label="Start date" />
      <Input name="endDate" type="date" aria-label="End date" />
      <Select name="status" defaultValue="active" aria-label="Status">
        {CONTRACT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Input name="notes" placeholder="Notes (optional)" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Adding…" : "Add contract"}
        </Button>
        {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-xs text-success">Added</span> : null}
      </div>
    </form>
  );
}

/* ------------------------------ Equipment ----------------------------- */

const EQUIPMENT_STATUSES = ["assigned", "returned", "retired"] as const;

function EquipmentPanel({ profileId, workforce }: { profileId: string; workforce: EmployeeWorkforce }) {
  return (
    <div className="grid gap-3">
      {workforce.equipment.length === 0 ? (
        <p className="text-sm text-muted-foreground">No equipment assigned.</p>
      ) : (
        workforce.equipment.map((e) => <EditEquipmentForm key={e.id} equipment={e} />)
      )}
      <CreateEquipmentForm profileId={profileId} />
    </div>
  );
}

function EditEquipmentForm({ equipment }: { equipment: EmployeeWorkforce["equipment"][number] }) {
  const [state, action, pending] = useActionState<ActionResult<{ updated: true }> | null, FormData>(
    updateEquipment,
    null,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
      <input type="hidden" name="equipmentId" value={equipment.id} />
      <Input name="name" defaultValue={equipment.name} placeholder="Equipment name" required />
      <Input name="assetTag" defaultValue={equipment.assetTag ?? ""} placeholder="Asset tag / serial" />
      <Input name="issuedOn" type="date" defaultValue={equipment.issuedOn ?? ""} aria-label="Issued on" />
      <Input name="returnedOn" type="date" defaultValue={equipment.returnedOn ?? ""} aria-label="Returned on" />
      <Select name="status" defaultValue={equipment.status} aria-label="Status">
        {EQUIPMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Input name="notes" defaultValue={equipment.notes ?? ""} placeholder="Notes" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-xs text-success">Saved</span> : null}
      </div>
    </form>
  );
}

function CreateEquipmentForm({ profileId }: { profileId: string }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createEquipment,
    null,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-3 sm:grid-cols-2">
      <input type="hidden" name="employeeProfileId" value={profileId} />
      <Input name="name" placeholder="Equipment name (e.g. PS5 Dev Kit)" required />
      <Input name="assetTag" placeholder="Asset tag / serial (optional)" />
      <Input name="issuedOn" type="date" aria-label="Issued on" />
      <Input name="notes" placeholder="Notes (optional)" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Adding…" : "Add equipment"}
        </Button>
        {state && !state.ok ? <span className="text-xs text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-xs text-success">Added</span> : null}
      </div>
    </form>
  );
}

/* ------------------------------ Analytics ----------------------------- */

function AnalyticsPanel({ workforce }: { workforce: EmployeeWorkforce }) {
  const { analytics } = workforce;
  const currentContract = workforce.contracts.find((c) => c.isCurrent) ?? null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total logged" value={`${analytics.totalHours}h`} />
        <Stat label="Approved" value={`${analytics.approvedHours}h`} />
        <Stat
          label="Contract start"
          value={currentContract?.startDate ?? workforce.contracts[0]?.startDate ?? "—"}
        />
        <Stat label="Contract end" value={currentContract?.endDate ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Approved hours by project</p>
          <DonutChart data={analytics.byProject.map((r) => ({ label: r.label, value: r.hours }))} size={140} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Approved hours by work type</p>
          <BarList data={analytics.byActivity.map((r, i) => ({ id: `${r.label}-${i}`, label: r.label, value: r.hours }))} colorize />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Time off used this year</p>
        {analytics.ptoUsedByType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved time off this year.</p>
        ) : (
          <BarList
            data={analytics.ptoUsedByType.map((r, i) => ({ id: `${r.label}-${i}`, label: r.label, value: r.hours }))}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-lg font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
