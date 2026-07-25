import { lighten, darken } from "./color";

// Literal hex approximations of the real SRU identity hues, used ONLY as the
// starting swatch value for a level's <input type="color"> picker (which
// cannot render a CSS var() string). The org chart itself keeps using the
// live CSS variables (see OrgChartTree.tsx) so a custom org_identity theme
// still shows through automatically for any level that hasn't been given an
// explicit override color — "أو يستخدم ثيم المنظمة" is the *default*
// behavior, not something the admin has to opt into.
export const SRU_DEFAULT_PRIMARY = "#501e8c";
export const SRU_DEFAULT_SECONDARY = "#0a6eaa";

export const DEFAULT_LEVEL_COLOR_SWATCHES: string[] = [
  SRU_DEFAULT_PRIMARY,
  SRU_DEFAULT_SECONDARY,
  "#8a5cc4",
  "#3f9dc9",
  lighten(SRU_DEFAULT_PRIMARY, 0.88) ?? "#f2ecfa",
  lighten(SRU_DEFAULT_SECONDARY, 0.9) ?? "#eaf6fb",
];

/** Starting color shown in a level's color picker before it has a custom override. */
export function defaultLevelColorSwatch(levelIndex: number): string {
  return DEFAULT_LEVEL_COLOR_SWATCHES[levelIndex % DEFAULT_LEVEL_COLOR_SWATCHES.length];
}

/**
 * Follow-up request (2026-07-25): besides a fully custom color, offer the
 * admin a quick pick of colors DERIVED from the organization's own real
 * identity colors (org_identity.primary_color/secondary_color, configured on
 * /admin/identity) — "اختيار لون من الوان الهوية ... ياخذ هذه الالوان من
 * الالوان الموجودة في صفحة الهوية". Callers pass the real stored colors (or
 * the SRU defaults when org_identity has none / isn't readable under the
 * caller's RLS), so this always reflects whatever identity is actually
 * configured, not a hardcoded palette.
 */
export function identityColorSwatches(primaryColor: string, secondaryColor: string): string[] {
  return [
    primaryColor,
    secondaryColor,
    darken(primaryColor, 0.25) ?? primaryColor,
    darken(secondaryColor, 0.25) ?? secondaryColor,
    lighten(primaryColor, 0.85) ?? primaryColor,
    lighten(secondaryColor, 0.85) ?? secondaryColor,
  ];
}
