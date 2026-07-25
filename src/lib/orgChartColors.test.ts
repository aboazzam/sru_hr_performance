import { describe, it, expect } from "vitest";
import { identityColorSwatches, defaultLevelColorSwatch, DEFAULT_LEVEL_COLOR_SWATCHES } from "./orgChartColors";

describe("identityColorSwatches", () => {
  it("puts the two real identity colors first, unmodified", () => {
    const swatches = identityColorSwatches("#501e8c", "#0a6eaa");
    expect(swatches[0]).toBe("#501e8c");
    expect(swatches[1]).toBe("#0a6eaa");
  });

  it("returns 6 distinct swatches derived from the given colors", () => {
    const swatches = identityColorSwatches("#501e8c", "#0a6eaa");
    expect(swatches).toHaveLength(6);
    expect(new Set(swatches).size).toBe(6);
  });

  it("reflects a genuinely different custom identity color, not the SRU default", () => {
    const swatches = identityColorSwatches("#ff0000", "#00ff00");
    expect(swatches[0]).toBe("#ff0000");
    expect(swatches[1]).toBe("#00ff00");
    expect(swatches).not.toContain("#501e8c");
  });
});

describe("defaultLevelColorSwatch", () => {
  it("cycles through the fixed default palette by index", () => {
    expect(defaultLevelColorSwatch(0)).toBe(DEFAULT_LEVEL_COLOR_SWATCHES[0]);
    expect(defaultLevelColorSwatch(DEFAULT_LEVEL_COLOR_SWATCHES.length)).toBe(DEFAULT_LEVEL_COLOR_SWATCHES[0]);
  });
});
