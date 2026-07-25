/**
 * Derives the light/dark shade variants sru-ui.css hardcodes alongside its
 * base colors (e.g. --sru-purple-dark, --sru-purple-light) from a single
 * chosen hex color — needed because org_identity only stores one base color
 * per role (primary/secondary), but the actual UI (sidebar background,
 * chip fills, ...) reads the derived shades, not just the base variable.
 * Without this, only the handful of elements that reference the base
 * variable directly would visibly change.
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, target: [number, number, number], amount: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const [tr, tg, tb] = target;
  return rgbToHex(r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount);
}

/** Mixes toward black — returns null for an invalid hex input rather than throwing. */
export function darken(hex: string, amount = 0.3): string | null {
  return mix(hex, [0, 0, 0], amount);
}

/** Mixes toward white — returns null for an invalid hex input rather than throwing. */
export function lighten(hex: string, amount = 0.88): string | null {
  return mix(hex, [255, 255, 255], amount);
}

/**
 * Picks readable text color (near-black or white) for an arbitrary
 * admin-chosen background hex, using the standard WCAG relative-luminance
 * threshold — needed for org-chart nodes once their color is no longer one
 * of the fixed, already-paired SRU palette entries. Defaults to white (the
 * safer fallback for an invalid hex, matching every existing node's fg).
 */
export function getContrastTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#1f2430" : "#ffffff";
}
