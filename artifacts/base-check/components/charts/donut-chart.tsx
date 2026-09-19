import { colorAt } from "./chart-palette";

export type DonutDatum = { label: string; value: number; color?: string };

/**
 * Self-contained SVG donut chart for part-to-whole data. No dependency, no
 * client JS.
 *
 * Each slice is drawn as its OWN explicit arc path (`A` command) with exact
 * start/end points on the ring, rather than layered full circles driven by
 * stroke-dashoffset. That earlier technique computed proportionally-correct
 * dash lengths but did not render as clean contiguous arcs; explicit arcs make
 * the geometry deterministic — the drawn wedge always matches the numbers.
 *
 * The legend always exposes the underlying value + percentage so the
 * information is never chart-only.
 */
export function DonutChart({
  data,
  size = 168,
  thickness = 26,
  unit = "h",
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  unit?: string;
}) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  // Total 0 (or no positive slices) → graceful empty state, never NaN/broken SVG.
  if (total <= 0) {
    return <p className="text-sm text-muted-foreground">No hours in the selected range.</p>;
  }

  const radius = (size - thickness) / 2;
  const center = size / 2;
  const single = slices.length === 1;

  // Point on the mid-line ring at a given fraction (0..1), starting at 12 o'clock,
  // going clockwise.
  const pointAt = (fraction: number): [number, number] => {
    const angle = (-90 + fraction * 360) * (Math.PI / 180);
    return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
  };

  const rendered = slices.map((d, i) => {
    const preceding = slices.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const fraction = d.value / total;
    const startFraction = preceding / total;
    const endFraction = startFraction + fraction;
    const [sx, sy] = pointAt(startFraction);
    const [ex, ey] = pointAt(endFraction);
    const largeArc = fraction > 0.5 ? 1 : 0;
    return {
      color: d.color ?? colorAt(i),
      // sweep-flag 1 = clockwise (matches the clockwise pointAt progression)
      path: `M ${sx.toFixed(3)} ${sy.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`,
      label: d.label,
      value: d.value,
      pct: Math.round(fraction * 1000) / 10,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Donut chart, total ${Math.round(total * 100) / 100}${unit}`}
        className="shrink-0"
      >
        {/* Track ring */}
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--muted)" strokeWidth={thickness} />

        {single ? (
          // A single 100% slice can't be drawn as an arc (start === end) — draw a full ring.
          <circle cx={center} cy={center} r={radius} fill="none" stroke={rendered[0].color} strokeWidth={thickness} />
        ) : (
          rendered.map((seg, i) => (
            <path key={i} d={seg.path} fill="none" stroke={seg.color} strokeWidth={thickness} strokeLinecap="butt" />
          ))
        )}

        <text x={center} y={center - 4} textAnchor="middle" className="fill-foreground text-lg font-semibold">
          {Math.round(total * 100) / 100}
        </text>
        <text x={center} y={center + 14} textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase">
          {unit === "h" ? "hours" : unit}
        </text>
      </svg>

      <ul className="grid flex-1 gap-1.5 text-sm">
        {rendered.map((seg, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="truncate">{seg.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">
                {seg.value}
                {unit}
              </span>{" "}
              · {seg.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
