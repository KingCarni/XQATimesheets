import { colorAt } from "./chart-palette";

export type BarDatum = { id: string; label: string; value: number };

/**
 * Reusable horizontal bar list for categorical comparison. Always shows the
 * numeric value beside each bar so the data is never chart-only.
 */
export function BarList({
  data,
  unit = "h",
  max: maxProp,
  colorize = false,
  limit = 12,
}: {
  data: BarDatum[];
  unit?: string;
  max?: number;
  colorize?: boolean;
  limit?: number;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No hours in the selected range.</p>;
  }
  const rows = data.slice(0, limit);
  const max = maxProp ?? Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="grid gap-2">
      {rows.map((row, i) => (
        <div key={row.id} className="grid gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate pr-2">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {row.value}
              {unit}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${Math.max(3, (row.value / max) * 100)}%`,
                backgroundColor: colorize ? colorAt(i) : "var(--xqa-blue)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
