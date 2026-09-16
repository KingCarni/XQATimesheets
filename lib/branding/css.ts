import type { CSSProperties } from "react";

/**
 * Turns an organization's two brand colours into the CSS custom properties the
 * app's theme is built on. Because the Tailwind theme maps every `xqa-*` colour
 * through an indirection (`--color-xqa-blue: var(--xqa-blue)`), overriding these
 * base variables on any subtree re-brands every descendant utility class — the
 * sidebar gradient, primary buttons, focus rings, etc. — with no per-component
 * changes. Client-safe (pure, no server-only imports).
 */

type Rgb = { r: number; g: number; b: number };

const HEX_RE = /^#?([0-9a-f]{6})$/i;

function parseHex(hex: string): Rgb | null {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear blend of `color` toward `target` by `amount` (0..1). */
function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Relative luminance (sRGB) — used to pick a readable foreground. */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// HourOps neutral defaults — used when an org has no colours of its own.
const DEFAULT_PRIMARY = "#087bea";
const DEFAULT_ACCENT = "#061b35";

/**
 * Build the inline style (a set of CSS custom properties) for a branded
 * subtree. Falls back to the HourOps defaults when a colour is missing/invalid.
 */
export function brandingStyleVars(
  primaryColor: string | null | undefined,
  accentColor: string | null | undefined,
): CSSProperties {
  const primary = parseHex(primaryColor ?? "") ?? parseHex(DEFAULT_PRIMARY)!;
  const accent = parseHex(accentColor ?? "") ?? parseHex(DEFAULT_ACCENT)!;

  const primaryLight = mix(primary, WHITE, 0.28); // xqa-blue-2 highlight
  const skySoft = mix(primary, WHITE, 0.9); // xqa-sky-soft tint
  const accentLight = mix(accent, WHITE, 0.1); // xqa-navy-2 panel
  const primaryFg = luminance(primary) > 0.55 ? "#0b1a26" : "#ffffff";

  return {
    "--primary": toHex(primary),
    "--primary-foreground": primaryFg,
    "--ring": toHex(primaryLight),
    "--xqa-blue": toHex(primary),
    "--xqa-blue-2": toHex(primaryLight),
    "--xqa-navy": toHex(accent),
    "--xqa-navy-2": toHex(accentLight),
    "--xqa-sky-soft": toHex(skySoft),
  } as CSSProperties;
}

export { BLACK, WHITE };
