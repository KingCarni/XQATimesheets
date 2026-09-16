/**
 * A brand-neutral, reasonably color-blind-aware categorical palette for the
 * self-contained charts. These are chart *marks*, so fixed hex values are used
 * (they read acceptably on both the light and dark card backgrounds). Colors
 * cycle if a series has more categories than the palette length.
 */
export const CHART_PALETTE = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#db2777", // pink
  "#059669", // emerald
  "#d97706", // amber
  "#0891b2", // cyan
  "#dc2626", // red
  "#4f46e5", // indigo
  "#0d9488", // teal
  "#ca8a04", // gold
  "#9333ea", // purple
  "#64748b", // slate
] as const;

export function colorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
