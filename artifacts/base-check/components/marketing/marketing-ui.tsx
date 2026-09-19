import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ============================================================================
 * Shared marketing UI primitives + product previews for the HourOps public
 * site. Composed from the real application's UI concepts (stat tiles, timesheet
 * rows, status pills, approval cards, report charts) using ONLY fictional
 * presentation data — never anything from a real tenant. Pure markup; brand via
 * the --hourops-* tokens. All server-safe.
 * ========================================================================== */

/** A clean application-style surface panel (no fake browser chrome). */
export function Surface({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "border-hourops-border/80 overflow-hidden rounded-2xl border bg-white shadow-[0_24px_60px_-32px_rgba(6,27,53,0.45)]",
        className,
      )}
    >
      {title ? (
        <div className="border-hourops-border/70 flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <span className="text-hourops-text text-[13px] font-semibold">{title}</span>
          {meta ? <span className="text-hourops-text-muted text-[11px] font-medium">{meta}</span> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </div>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "approved" | "submitted" | "open" | "changes" }) {
  const tones = {
    approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    submitted: "bg-hourops-blue/10 text-hourops-blue ring-hourops-blue/20",
    open: "bg-slate-100 text-slate-600 ring-slate-500/20",
    changes: "bg-amber-50 text-amber-700 ring-amber-600/20",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tones[tone])}>
      {label}
    </span>
  );
}

export function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        accent ? "border-hourops-blue/25 bg-gradient-to-br from-hourops-blue/10 to-hourops-cyan/10" : "border-hourops-border bg-white",
      )}
    >
      <p className="text-hourops-text-muted text-[11px] font-medium">{label}</p>
      <p className="text-hourops-text mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export function BarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-hourops-text w-24 shrink-0 truncate text-xs font-medium">{label}</span>
      <span className="bg-hourops-surface-muted relative h-2 flex-1 overflow-hidden rounded-full">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="text-hourops-text-muted w-9 shrink-0 text-right text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "from-hourops-navy to-hourops-blue flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white",
        className,
      )}
    >
      {name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
    </span>
  );
}

/** Donut built from a conic-gradient (no chart dependency). */
export function Donut({
  segments,
  center,
  sub,
  size = 128,
}: {
  segments: { pct: number; color: string }[];
  center: string;
  sub?: string;
  size?: number;
}) {
  // Cumulative offsets computed without mutating outer state (render-safe).
  const offsets = segments.map((_, i) => segments.slice(0, i).reduce((sum, seg) => sum + seg.pct, 0));
  const stops = segments.map((s, i) => `${s.color} ${offsets[i]}% ${offsets[i] + s.pct}%`).join(", ");
  return (
    <div className="relative shrink-0 rounded-full" style={{ width: size, height: size, background: `conic-gradient(${stops})` }}>
      <div className="absolute inset-[24%] flex flex-col items-center justify-center rounded-full bg-white">
        <span className="text-hourops-text text-base font-semibold leading-none">{center}</span>
        {sub ? <span className="text-hourops-text-muted mt-0.5 text-[10px]">{sub}</span> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Fictional dataset */

const TEAM = [
  { name: "Alex Morgan", role: "QA Analyst", hours: "40h", tone: "approved" as const, status: "Approved" },
  { name: "Jamie Chen", role: "QA Lead", hours: "38h", tone: "submitted" as const, status: "Submitted" },
  { name: "Taylor Singh", role: "Engineer", hours: "36h", tone: "approved" as const, status: "Approved" },
  { name: "Priya Nair", role: "QA Analyst", hours: "32h", tone: "open" as const, status: "Open" },
];

const PROJECT_SEGMENTS = [
  { label: "Project Atlas", pct: 44, color: "var(--hourops-blue)" },
  { label: "Platform QA", pct: 32, color: "var(--hourops-blue-bright)" },
  { label: "Internal", pct: 24, color: "var(--hourops-cyan)" },
];

/** Hero composition: layered week / approvals / report surfaces on navy. */
export function HeroProduct() {
  return (
    <div className="relative">
      {/* main week panel */}
      <Surface title="Northstar QA — This Week" meta="Sep 14 – 20">
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile label="Total" value="286h" accent />
          <StatTile label="Billable" value="254h" />
          <StatTile label="PTO" value="16h" />
        </div>
        <div className="border-hourops-border divide-hourops-border/70 mt-4 divide-y overflow-hidden rounded-xl border">
          {TEAM.map((m) => (
            <div key={m.name} className="flex items-center gap-3 bg-white px-3 py-2.5">
              <Avatar name={m.name} className="h-7 w-7 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="text-hourops-text block truncate text-sm font-medium">{m.name}</span>
                <span className="text-hourops-text-muted block truncate text-[11px]">{m.role}</span>
              </span>
              <span className="text-hourops-text text-sm font-semibold tabular-nums">{m.hours}</span>
              <span className="w-[84px] text-right"><StatusPill label={m.status} tone={m.tone} /></span>
            </div>
          ))}
        </div>
      </Surface>

      {/* floating approvals card (top-right) */}
      <div className="absolute -top-6 -right-4 hidden w-52 lg:block">
        <Surface bodyClassName="p-3.5">
          <p className="text-hourops-text-muted text-[11px] font-semibold">Approvals</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-hourops-text text-3xl font-semibold leading-none">9</span>
            <span className="text-hourops-text-muted pb-0.5 text-[11px]">of 12 approved</span>
          </div>
          <div className="bg-hourops-surface-muted mt-2 h-1.5 overflow-hidden rounded-full">
            <span className="from-hourops-blue to-hourops-cyan block h-full w-3/4 rounded-full bg-gradient-to-r" />
          </div>
          <div className="text-hourops-text-muted mt-2 flex justify-between text-[10px]">
            <span>2 pending</span><span>1 needs changes</span>
          </div>
        </Surface>
      </div>

      {/* floating report card (bottom-left) */}
      <div className="absolute -bottom-8 -left-6 hidden w-56 lg:block">
        <Surface bodyClassName="p-3.5">
          <p className="text-hourops-text-muted text-[11px] font-semibold">Hours by project</p>
          <div className="mt-2 flex items-center gap-3">
            <Donut size={72} segments={PROJECT_SEGMENTS} center="286h" />
            <ul className="flex flex-col gap-1">
              {PROJECT_SEGMENTS.map((s) => (
                <li key={s.label} className="flex items-center gap-1.5 text-[10px]">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  <span className="text-hourops-text font-medium">{s.label}</span>
                  <span className="text-hourops-text-muted tabular-nums">{s.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Surface>
      </div>
    </div>
  );
}

/** Time-tracking section: a weekly entry surface. */
export function TimesheetPreview() {
  const days = [
    { d: "Mon", h: "8h", on: true },
    { d: "Tue", h: "8h", on: true },
    { d: "Wed", h: "6h", on: true },
    { d: "Thu", h: "8h", on: false },
    { d: "Fri", h: "—", on: false },
  ];
  return (
    <Surface title="My Timesheet — Week of Sep 14" meta="Open">
      <div className="grid grid-cols-5 gap-2">
        {days.map((x) => (
          <div
            key={x.d}
            className={cn(
              "rounded-lg border px-2 py-2 text-center",
              x.on ? "border-hourops-blue/30 bg-hourops-blue/5" : "border-hourops-border bg-white",
            )}
          >
            <p className="text-hourops-text-muted text-[10px] font-medium">{x.d}</p>
            <p className="text-hourops-text mt-0.5 text-sm font-semibold">{x.h}</p>
          </div>
        ))}
      </div>
      <div className="border-hourops-border mt-3 overflow-hidden rounded-xl border">
        <div className="text-hourops-text-muted bg-hourops-surface-muted grid grid-cols-[1.4fr_1fr_1.2fr_0.6fr] gap-2 px-3 py-2 text-[10px] font-semibold tracking-wide uppercase">
          <span>Project</span><span>Platform</span><span>Work type</span><span className="text-right">Hours</span>
        </div>
        {[
          ["Project Atlas", "Web", "Regression", "3.5"],
          ["Mobile QA", "iOS", "Functional", "2.5"],
          ["Project Atlas", "Web", "Bug Verification", "2.0"],
        ].map((r) => (
          <div key={r.join()} className="border-hourops-border/60 text-hourops-text grid grid-cols-[1.4fr_1fr_1.2fr_0.6fr] gap-2 border-t px-3 py-2 text-xs">
            <span className="font-medium">{r[0]}</span>
            <span className="text-hourops-text-muted">{r[1]}</span>
            <span className="text-hourops-text-muted">{r[2]}</span>
            <span className="text-right font-semibold tabular-nums">{r[3]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-hourops-text-muted text-xs">Total <span className="text-hourops-text font-semibold">8.0h</span> today</span>
        <span className="from-hourops-blue to-hourops-blue-bright rounded-lg bg-gradient-to-r px-3 py-1.5 text-xs font-semibold text-white">Submit week</span>
      </div>
    </Surface>
  );
}

/** Approvals preview (used on the navy section, so it reads on dark). */
export function ApprovalsPreview() {
  const rows = [
    { name: "Jamie Chen", hours: "38h", tone: "submitted" as const, status: "Submitted" },
    { name: "Priya Nair", hours: "34h", tone: "submitted" as const, status: "Submitted" },
    { name: "Sam Okafor", hours: "40h", tone: "changes" as const, status: "Needs changes" },
    { name: "Alex Morgan", hours: "40h", tone: "approved" as const, status: "Approved" },
  ];
  return (
    <Surface title="Approvals — Sep 14 – 20" meta="4 in review">
      <div className="grid grid-cols-4 gap-2">
        {[["12", "Submitted"], ["9", "Approved"], ["2", "Pending"], ["1", "Changes"]].map(([n, l]) => (
          <div key={l} className="border-hourops-border rounded-lg border bg-white px-2 py-2 text-center">
            <p className="text-hourops-text text-lg font-semibold leading-none">{n}</p>
            <p className="text-hourops-text-muted mt-1 text-[10px]">{l}</p>
          </div>
        ))}
      </div>
      <div className="border-hourops-border divide-hourops-border/70 mt-3 divide-y overflow-hidden rounded-xl border">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 bg-white px-3 py-2.5">
            <Avatar name={r.name} className="h-7 w-7 text-[10px]" />
            <span className="text-hourops-text flex-1 truncate text-sm font-medium">{r.name}</span>
            <span className="text-hourops-text text-sm font-semibold tabular-nums">{r.hours}</span>
            <span className="w-[112px] text-right"><StatusPill label={r.status} tone={r.tone} /></span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/** Reporting preview: donut + work-type bars + billable. */
export function ReportPreview() {
  return (
    <Surface title="Reports — Sep 14 – 20" meta="Weekly">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Total" value="286h" accent />
        <StatTile label="Billable" value="254h" />
        <StatTile label="PTO" value="16h" />
        <StatTile label="Employees" value="24" />
      </div>
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-hourops-text-muted mb-3 text-[11px] font-semibold">Hours by project</p>
          <div className="flex items-center gap-4">
            <Donut segments={PROJECT_SEGMENTS} center="286h" sub="tracked" />
            <ul className="flex flex-col gap-1.5">
              {PROJECT_SEGMENTS.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  <span className="text-hourops-text font-medium">{s.label}</span>
                  <span className="text-hourops-text-muted tabular-nums">{s.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div>
          <p className="text-hourops-text-muted mb-3 text-[11px] font-semibold">Work-type mix</p>
          <div className="flex flex-col gap-2.5">
            <BarRow label="Functional" pct={41} color="var(--hourops-blue)" />
            <BarRow label="Regression" pct={34} color="var(--hourops-blue-bright)" />
            <BarRow label="Automation" pct={25} color="var(--hourops-cyan)" />
          </div>
          <div className="border-hourops-border mt-4 flex items-center justify-between rounded-xl border bg-white px-3 py-2.5">
            <span className="text-hourops-text-muted text-[11px] font-medium">Billable vs non-billable</span>
            <span className="text-hourops-text text-xs font-semibold">89% billable</span>
          </div>
        </div>
      </div>
    </Surface>
  );
}

/** Team-operations composition: people / time off / projects / equipment. */
export function TeamOpsPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Surface title="People" bodyClassName="p-3.5">
        <div className="flex flex-col gap-2.5">
          {[["Alex Morgan", "QA Analyst · Vancouver"], ["Jamie Chen", "QA Lead · Toronto"]].map(([n, r]) => (
            <div key={n} className="flex items-center gap-2.5">
              <Avatar name={n} className="h-8 w-8 text-[11px]" />
              <span>
                <span className="text-hourops-text block text-xs font-semibold">{n}</span>
                <span className="text-hourops-text-muted block text-[10px]">{r}</span>
              </span>
            </div>
          ))}
        </div>
      </Surface>
      <Surface title="Time off" bodyClassName="p-3.5">
        <div className="flex flex-col gap-2">
          {[["Vacation", "Sep 22–24", "approved"], ["Sick leave", "Sep 18", "approved"]].map(([t, d]) => (
            <div key={t} className="border-hourops-border flex items-center justify-between rounded-lg border px-2.5 py-1.5">
              <span className="text-hourops-text text-xs font-medium">{t}</span>
              <span className="text-hourops-text-muted text-[10px]">{d}</span>
            </div>
          ))}
          <div className="text-hourops-text-muted mt-1 text-[11px]">18 days balance remaining</div>
        </div>
      </Surface>
      <Surface title="Projects" bodyClassName="p-3.5">
        <div className="flex flex-col gap-2">
          {[["Project Atlas", "8 assigned"], ["Mobile QA", "5 assigned"], ["Platform", "6 assigned"]].map(([p, a]) => (
            <div key={p} className="flex items-center justify-between text-xs">
              <span className="text-hourops-text font-medium">{p}</span>
              <span className="text-hourops-text-muted">{a}</span>
            </div>
          ))}
        </div>
      </Surface>
      <Surface title="Equipment & contracts" bodyClassName="p-3.5">
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-hourops-text font-medium">MacBook Pro 16&quot;</span>
            <StatusPill label="Assigned" tone="submitted" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-hourops-text font-medium">Contract — Full-time</span>
            <StatusPill label="Active" tone="approved" />
          </div>
        </div>
      </Surface>
    </div>
  );
}

/** Excel import → validated → workspace-ready transformation. */
export function ImportFlow() {
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <Surface bodyClassName="p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-[11px] font-bold text-emerald-700">XLS</span>
          <span>
            <span className="text-hourops-text block text-sm font-semibold">employees.xlsx</span>
            <span className="text-hourops-text-muted block text-[11px]">Your existing spreadsheet</span>
          </span>
        </div>
      </Surface>
      <FlowArrow />
      <Surface bodyClassName="p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-hourops-text text-lg font-semibold">24</p><p className="text-hourops-text-muted text-[10px]">Employees</p></div>
          <div><p className="text-hourops-blue text-lg font-semibold">3</p><p className="text-hourops-text-muted text-[10px]">Projects</p></div>
          <div><p className="text-lg font-semibold text-amber-600">1</p><p className="text-hourops-text-muted text-[10px]">To review</p></div>
        </div>
        <p className="text-hourops-text-muted mt-2 text-center text-[11px]">Detected &amp; validated</p>
      </Surface>
      <FlowArrow />
      <Surface bodyClassName="p-4">
        <div className="flex items-center gap-3">
          <span className="bg-hourops-blue/10 text-hourops-blue flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold">✓</span>
          <span>
            <span className="text-hourops-text block text-sm font-semibold">Workspace ready</span>
            <span className="text-hourops-text-muted block text-[11px]">Invite the team &amp; go</span>
          </span>
        </div>
      </Surface>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center py-1 sm:py-0" aria-hidden>
      <span className="text-hourops-blue/50 rotate-90 text-xl sm:rotate-0">→</span>
    </div>
  );
}

/** Same HourOps interface, three fictional branded workspaces. */
export function WorkspaceBrandPreview() {
  const brands = [
    { name: "Northstar QA", initials: "NQ", from: "#0e3866", to: "#087bea", accent: "#087bea" },
    { name: "Acme Studio", initials: "AS", from: "#3b1667", to: "#7c3aed", accent: "#7c3aed" },
    { name: "Vertex Labs", initials: "VL", from: "#0c3b2e", to: "#0f9d76", accent: "#0f9d76" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {brands.map((b) => (
        <div key={b.name} className="border-hourops-border overflow-hidden rounded-2xl border bg-white shadow-[0_20px_50px_-34px_rgba(6,27,53,0.5)]">
          <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${b.from}, ${b.to})` }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-[11px] font-bold">{b.initials}</span>
            <span className="text-sm font-semibold">{b.name}</span>
          </div>
          <div className="p-3.5">
            <div className="grid grid-cols-3 gap-1.5">
              {["Total", "Billable", "PTO"].map((l, i) => (
                <div key={l} className="border-hourops-border rounded-lg border px-1.5 py-1.5 text-center">
                  <p className="text-hourops-text text-xs font-semibold">{["286h", "254h", "16h"][i]}</p>
                  <p className="text-hourops-text-muted text-[9px]">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {[70, 52, 38].map((w, i) => (
                <span key={i} className="bg-hourops-surface-muted h-1.5 overflow-hidden rounded-full">
                  <span className="block h-full rounded-full" style={{ width: `${w}%`, background: b.accent }} />
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
