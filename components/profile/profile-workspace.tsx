"use client";

import { useActionState, useState } from "react";
import { Download, FileText, Laptop } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { createPtoRequest, cancelPtoRequest } from "@/app/(app)/pto/actions";
import {
  submitHardwareRequest,
  cancelHardwareRequest,
  updatePublicProfile,
  uploadAvatar,
  type ActionResult,
} from "@/app/(app)/profile/actions";
import { HARDWARE_REQUEST_MAX_LENGTH } from "@/types/domain";
import type { HardwareRequestDto } from "@/lib/hardware/queries";
import type { ProfileOverview } from "@/lib/profile/queries";
import type { LeaveBalanceDto } from "@/lib/leave/entitlements";
import type { ContractDto } from "@/lib/contracts/queries";
import type { EquipmentDto } from "@/lib/equipment/queries";

type OwnPto = {
  id: string;
  typeName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  status: string;
  notes: string | null;
  approverEmail: string | null;
};

type Tab = "overview" | "timeoff" | "contract" | "equipment" | "requests";

export function ProfileWorkspace({
  overview,
  balances,
  ptoTypes,
  ownPto,
  contracts,
  equipment,
  hardware,
}: {
  overview: ProfileOverview;
  balances: LeaveBalanceDto[];
  ptoTypes: { id: string; name: string }[];
  ownPto: OwnPto[];
  contracts: ContractDto[];
  equipment: EquipmentDto[];
  hardware: HardwareRequestDto[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "timeoff", label: "Time Off" },
    { key: "contract", label: "Contract" },
    { key: "equipment", label: "Equipment" },
    { key: "requests", label: "Requests" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm">Your employment details, time off, contract, and equipment.</p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-xqa-sky-soft text-xqa-blue" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab overview={overview} contracts={contracts} /> : null}
      {tab === "timeoff" ? <TimeOffTab balances={balances} ptoTypes={ptoTypes} ownPto={ownPto} /> : null}
      {tab === "contract" ? <ContractTab contracts={contracts} /> : null}
      {tab === "equipment" ? <EquipmentTab equipment={equipment} /> : null}
      {tab === "requests" ? <RequestsTab hardware={hardware} /> : null}
    </div>
  );
}

/* ------------------------------ Overview ------------------------------ */

function OverviewTab({ overview, contracts }: { overview: ProfileOverview; contracts: ContractDto[] }) {
  const current = contracts.find((c) => c.isCurrent) ?? null;
  const facts: { label: string; value: string }[] = [
    { label: "Full name", value: overview.fullName },
    { label: "Email", value: overview.email },
    { label: "Role", value: overview.role },
    { label: "Employee code", value: overview.employeeCode ?? "—" },
    { label: "Department", value: overview.department ?? "—" },
    { label: "Timezone", value: overview.timezone },
    { label: "Start date", value: overview.startDate ?? "—" },
    { label: "End date", value: overview.endDate ?? "—" },
  ];

  return (
    <div className="grid gap-4">
      <PublicProfileEditor overview={overview} />

      <Section title="Employee details">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs font-medium uppercase text-muted-foreground">{f.label}</dt>
              <dd className={cn("text-sm font-medium", f.label === "Role" && "capitalize")}>{f.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">Status</dt>
            <dd className="text-sm">
              <StatusBadge status={overview.isActive ? "active" : "terminated"} />
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Assigned projects">
        {overview.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active project assignments.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {overview.projects.map((p) => (
              <li key={p.name} className="rounded-full border border-border bg-muted/40 px-3 py-1 text-sm">
                {p.name} <span className="text-muted-foreground">· {p.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Current contract">
        {current ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {current.title}
                {current.contractType ? <span className="text-muted-foreground"> · {current.contractType}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {current.startDate} → {current.endDate ?? "ongoing"}
              </p>
            </div>
            <StatusBadge status={current.status} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No current contract on file.</p>
        )}
      </Section>
    </div>
  );
}

function PublicProfileEditor({ overview }: { overview: ProfileOverview }) {
  const [state, action, pending] = useActionState<ActionResult<{ updated: true }> | null, FormData>(
    updatePublicProfile,
    null,
  );

  const initials = overview.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Section title="Public profile" subtitle="Shown to teammates in the People directory. You control these fields.">
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="flex flex-col items-center gap-2">
          {overview.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin authed bytea
            <img src={overview.avatarUrl} alt="Your avatar" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-xqa-sky-soft text-xl font-semibold text-xqa-blue">
              {initials || "?"}
            </span>
          )}
          <AvatarUploadForm />
        </div>

        <form action={action} className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="nickname">Nickname</Label>
            <Input id="nickname" name="nickname" defaultValue={overview.nickname ?? ""} maxLength={80} placeholder="e.g. Alex" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pronouns">Pronouns</Label>
            <Input id="pronouns" name="pronouns" defaultValue={overview.pronouns ?? ""} maxLength={40} placeholder="e.g. she/her" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" defaultValue={overview.location ?? ""} maxLength={120} placeholder="e.g. Vancouver, BC" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
            <Input id="linkedinUrl" name="linkedinUrl" defaultValue={overview.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/…" />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save profile"}
            </Button>
            {state && !state.ok ? <span className="text-sm text-destructive">{state.error}</span> : null}
            {state?.ok ? <span className="text-sm text-success">Saved.</span> : null}
          </div>
        </form>
      </div>
    </Section>
  );
}

function AvatarUploadForm() {
  const [state, action, pending] = useActionState<ActionResult<{ updated: true }> | null, FormData>(
    uploadAvatar,
    null,
  );
  return (
    <form action={action} className="flex flex-col items-center gap-1">
      <input
        type="file"
        name="avatar"
        accept="image/png,image/jpeg,image/webp"
        required
        className="max-w-[190px] text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Uploading…" : "Update photo"}
      </Button>
      {state && !state.ok ? <span className="text-center text-xs text-destructive">{state.error}</span> : null}
      {state?.ok ? <span className="text-xs text-success">Updated</span> : null}
    </form>
  );
}

/* ------------------------------ Time Off ------------------------------ */

function TimeOffTab({
  balances,
  ptoTypes,
  ownPto,
}: {
  balances: LeaveBalanceDto[];
  ptoTypes: { id: string; name: string }[];
  ownPto: OwnPto[];
}) {
  return (
    <div className="grid gap-4">
      {balances.length > 0 ? (
        <Section title="Balances" subtitle="Admin-managed entitlements. Used reflects approved requests this year.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => {
              const configured = b.entitlementHours !== null;
              return (
                <div key={b.activityTypeId} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{b.typeName}</p>
                    {!configured ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        No entitlement set
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-center text-sm">
                    <Metric label="Entitled" value={configured ? `${b.entitlementHours}h` : "—"} unknown={!configured} />
                    <Metric label="Used" value={`${b.usedHours}h`} />
                    <Metric
                      label="Left"
                      value={b.remainingHours === null ? "—" : `${b.remainingHours}h`}
                      unknown={b.remainingHours === null}
                      negative={b.remainingHours !== null && b.remainingHours < 0}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="Request time off">
        {ptoTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time-off types are configured yet. Ask an admin.</p>
        ) : (
          <form action={createPtoRequest} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="activityTypeId">Type</Label>
              <Select id="activityTypeId" name="activityTypeId" required defaultValue="">
                <option value="" disabled>
                  Select type
                </option>
                {ptoTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hoursPerDay">Hours per day</Label>
              <Input id="hoursPerDay" name="hoursPerDay" type="number" min="0.25" max="24" step="0.25" defaultValue="8" required />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-5">
              <Label htmlFor="notes">Note</Label>
              <Input id="notes" name="notes" placeholder="Optional note" />
            </div>
            <div className="md:col-span-2 xl:col-span-5">
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        )}
      </Section>

      <Section title="My requests">
        {ownPto.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time-off requests yet.</p>
        ) : (
          <div className="grid gap-2">
            {ownPto.map((req) => (
              <div
                key={req.id}
                className="flex flex-col gap-2 rounded-xl border border-border p-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{req.typeName}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-sm">
                    {req.startDate} → {req.endDate} · {req.totalHours}h total
                  </p>
                  {req.notes ? <p className="text-sm text-muted-foreground">{req.notes}</p> : null}
                  {req.approverEmail ? (
                    <p className="text-xs text-muted-foreground">Reviewed by {req.approverEmail}</p>
                  ) : null}
                </div>
                {req.status === "requested" ? (
                  <form action={cancelPtoRequest}>
                    <input type="hidden" name="requestId" value={req.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Cancel
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------ Contract ------------------------------ */

function ContractTab({ contracts }: { contracts: ContractDto[] }) {
  if (contracts.length === 0) {
    return (
      <Section title="Contracts">
        <p className="text-sm text-muted-foreground">No contracts on file yet.</p>
      </Section>
    );
  }
  return (
    <div className="grid gap-3">
      {contracts.map((c) => (
        <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-semibold">{c.title}</p>
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
          {c.notes ? <p className="mt-1 text-sm">{c.notes}</p> : null}
          {c.attachments.length > 0 ? (
            <div className="mt-2 grid gap-1.5">
              {c.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/contracts/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-xqa-sky-soft"
                >
                  <FileText className="h-4 w-4" />
                  {a.originalFilename}
                  <span className="text-xs text-muted-foreground">({formatBytes(a.sizeBytes)})</span>
                  <Download className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No document attached.</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Equipment ----------------------------- */

function EquipmentTab({ equipment }: { equipment: EquipmentDto[] }) {
  if (equipment.length === 0) {
    return (
      <Section title="Equipment">
        <p className="text-sm text-muted-foreground">No equipment assigned to you.</p>
      </Section>
    );
  }
  return (
    <Section title="Assigned equipment">
      <div className="grid gap-2">
        {equipment.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-3">
              <Laptop className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-semibold">
                  {e.name}
                  {e.assetTag ? <span className="text-muted-foreground"> · {e.assetTag}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.issuedOn ? `Issued ${e.issuedOn}` : "Issue date not set"}
                  {e.returnedOn ? ` · Returned ${e.returnedOn}` : ""}
                </p>
              </div>
            </div>
            <StatusBadge status={e.status} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------ Requests ------------------------------ */

function RequestsTab({ hardware }: { hardware: HardwareRequestDto[] }) {
  return (
    <div className="grid gap-4">
      <Section title="Request hardware" subtitle="Ask for equipment you need. An admin will review it.">
        <HardwareRequestForm />
      </Section>

      <Section title="My hardware requests">
        {hardware.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hardware requests yet.</p>
        ) : (
          <div className="grid gap-2">
            {hardware.map((req) => (
              <div key={req.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={req.status} />
                      {req.category ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {req.category}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm">{req.details}</p>
                    {req.reviewNote ? (
                      <p className="text-xs text-muted-foreground">Review note: {req.reviewNote}</p>
                    ) : null}
                  </div>
                  {req.status === "requested" ? (
                    <form action={cancelHardwareRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Cancel
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function HardwareRequestForm() {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    submitHardwareRequest,
    null,
  );
  const [details, setDetails] = useState("");

  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <div className="space-y-1">
          <Label htmlFor="details">What do you need?</Label>
          <textarea
            id="details"
            name="details"
            required
            maxLength={HARDWARE_REQUEST_MAX_LENGTH}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            className="border-input bg-card w-full rounded-lg border px-3 py-2 text-sm shadow-inner shadow-slate-100/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
            placeholder="e.g. A second monitor and a USB-C dock"
          />
          <p className="text-right text-xs text-muted-foreground">
            {details.length}/{HARDWARE_REQUEST_MAX_LENGTH}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="category">Category (optional)</Label>
          <Input id="category" name="category" placeholder="e.g. Peripheral" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
        {state && !state.ok ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-sm text-success">Request submitted.</span> : null}
      </div>
    </form>
  );
}

/* ------------------------------- Shared ------------------------------- */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  unknown = false,
  negative = false,
}: {
  label: string;
  value: string;
  unknown?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/50 py-1.5">
      <p
        className={cn(
          "text-sm font-semibold",
          unknown && "text-muted-foreground/60",
          negative && "text-destructive",
        )}
        title={unknown ? "Not configured" : undefined}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}
