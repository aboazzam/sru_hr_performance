import { describe, it, expect } from "vitest";
import { reorderIds } from "./reorder";

describe("reorderIds", () => {
  it("moves an item forward to sit at the target's position", () => {
    expect(reorderIds(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward to sit at the target's position", () => {
    expect(reorderIds(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when dragged and target are the same", () => {
    expect(reorderIds(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });

  it("returns the original list unchanged if either id is unknown", () => {
    expect(reorderIds(["a", "b", "c"], "x", "b")).toEqual(["a", "b", "c"]);
    expect(reorderIds(["a", "b", "c"], "a", "x")).toEqual(["a", "b", "c"]);
  });

  it("preserves the relative order of untouched items", () => {
    expect(reorderIds(["a", "b", "c", "d", "e"], "e", "a")).toEqual(["e", "a", "b", "c", "d"]);
  });
});
