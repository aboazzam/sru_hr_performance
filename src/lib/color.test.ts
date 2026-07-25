import { describe, it, expect } from "vitest";
import { darken, lighten } from "./color";

describe("darken", () => {
  it("mixes toward black", () => {
    expect(darken("#ffffff", 0.5)).toBe("#808080");
    expect(darken("#ff0000", 1)).toBe("#000000");
  });

  it("returns the same color at amount 0", () => {
    expect(darken("#501e8c", 0)).toBe("#501e8c");
  });

  it("returns null for an invalid hex", () => {
    expect(darken("not-a-color")).toBeNull();
    expect(darken("#abc")).toBeNull();
  });
});

describe("lighten", () => {
  it("mixes toward white", () => {
    expect(lighten("#000000", 0.5)).toBe("#808080");
    expect(lighten("#000000", 1)).toBe("#ffffff");
  });

  it("returns the same color at amount 0", () => {
    expect(lighten("#0a6eaa", 0)).toBe("#0a6eaa");
  });

  it("returns null for an invalid hex", () => {
    expect(lighten("javascript:alert(1)")).toBeNull();
  });
});
