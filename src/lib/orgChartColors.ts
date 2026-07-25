import { lighten } from "./color";

// Literal hex approximations of the real SRU identity hues, used ONLY as the
// starting swatch value for a level's <input type="color"> picker (which
// cannot render a CSS var() string). The org chart itself keeps using the
// live CSS variables (see OrgChartTree.tsx) so a custom org_identity theme
// still shows through automatically for any level that hasn't been given an
// explicit override color — "أو يستخدم ثيم المنظمة" is the *default*
// behavior, not something the admin has to opt into.
const SRU_PURPLE = "#501e8c";
const SRU_BLUE = "#0a6eaa";

export const DEFAULT_LEVEL_COLOR_SWATCHES: string[] = [
  SRU_PURPLE,
  SRU_BLUE,
  "#8a5cc4",
  "#3f9dc9",
  lighten(SRU_PURPLE, 0.88) ?? "#f2ecfa",
  lighten(SRU_BLUE, 0.9) ?? "#eaf6fb",
];

/** Starting color shown in a level's color picker before it has a custom override. */
export function defaultLevelColorSwatch(levelIndex: number): string {
  return DEFAULT_LEVEL_COLOR_SWATCHES[levelIndex % DEFAULT_LEVEL_COLOR_SWATCHES.length];
}
