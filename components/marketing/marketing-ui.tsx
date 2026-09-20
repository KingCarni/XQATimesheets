import type { ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";

/**
 * Marketing product-preview primitives, ported from the approved prototype.
 * Presentation only — these never query, mutate, or receive tenant data. All
 * values shown are static illustrative demo data. Styles live in landing.css.
 */

export function Surface({
  children,
  title,
  meta,
  className = "",
  bodyClassName = "",
}: {
  children: ReactNode;
  title?: string;
  meta?: string;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`ho-surface ${className}`.trim()}>
      {title ? (
        <div className="ho-surface-heading">
          <strong>{title}</strong>
          {meta ? <span>{meta}</span> : null}
        </div>
      ) : null}
      <div className={`ho-surface-body ${bodyClassName}`.trim()}>{children}</div>
    </div>
  );
}

export type StatusTone = "open" | "submitted" | "approved" | "changes";

export function StatusPill({ label, tone = "open" }: { label: string; tone?: StatusTone }) {
  return (
    <span className={`ho-status ho-status-${tone}`}>
      {tone === "approved" ? <Check size={11} /> : <i />}
      {label}
    </span>
  );
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={`ho-avatar ${className}`.trim()} aria-hidden="true">
      {initials}
    </span>
  );
}

export function StatTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`ho-stat ${accent ? "ho-stat-accent" : ""}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export type Segment = { pct: number; color: string };

export function Donut({ segments, center, sub }: { segments: Segment[]; center: string; sub?: string }) {
  const stops = segments
    .map((s, i) => {
      const start = segments.slice(0, i).reduce((sum, x) => sum + x.pct, 0);
      return `${s.color} ${start}% ${start + s.pct}%`;
    })
    .join(", ");
  return (
    <div
      className="ho-donut"
      style={{ background: `conic-gradient(${stops})` }}
      role="img"
      aria-label={`${center} ${sub || ""}; breakdown listed alongside`}
    >
      <div>
        <strong>{center}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}

export function BarRow({
  label,
  pct,
  color,
  value,
}: {
  label: string;
  pct: number;
  color: string;
  value?: string;
}) {
  return (
    <div className="ho-bar-row">
      <div>
        <span>{label}</span>
        <strong>{value || `${pct}%`}</strong>
      </div>
      <span className="ho-bar-track">
        <span style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}

export const PROJECTS: { name: string; hours: number; pct: number; color: string }[] = [
  { name: "Project Atlas", hours: 240, pct: 50, color: "#087bea" },
  { name: "Mobile QA", hours: 160, pct: 100 / 3, color: "#04c9f4" },
  { name: "Platform", hours: 80, pct: 100 / 6, color: "#8faac6" },
];

export function ProductNote({ children }: { children?: ReactNode }) {
  return (
    <p className="ho-product-note">
      <span className="ho-note-dot" />
      {children || "Interactive product preview · Illustrative data"}
      <ArrowUpRight size={12} aria-hidden="true" />
    </p>
  );
}
