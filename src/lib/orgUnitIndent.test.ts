import { describe, expect, it } from "vitest";
import { computeOrgUnitIndents, type IndentableUnit } from "./orgUnitIndent";

const unit = (id: string, parentId: string | null, levelOrder: number | null): IndentableUnit => ({
  id,
  parentId,
  levelOrder,
});

describe("computeOrgUnitIndents", () => {
  it("indents by level rank, not by position in the tree", () => {
    // Both are children of the same root, so depth would have tied them.
    const indents = computeOrgUnitIndents([
      unit("root", null, 1),
      unit("c3", "root", 3),
      unit("c4", "root", 6),
    ]);
    expect(indents.get("root")).toBe(0);
    expect(indents.get("c3")).toBe(2);
    expect(indents.get("c4")).toBe(5);
    // The actual ask: C4 further in than C3.
    expect(indents.get("c4")!).toBeGreaterThan(indents.get("c3")!);
  });

  it("measures from rank 1, not from the smallest level in use", () => {
    // Anchoring to the data would re-indent everything the day a unit is
    // first assigned to a higher rank than any used before.
    const indents = computeOrgUnitIndents([unit("a", null, 5), unit("b", "a", 7)]);
    expect(indents.get("a")).toBe(4);
    expect(indents.get("b")).toBe(6);
  });

  it("gives an unlevelled unit its parent's indent plus one", () => {
    const indents = computeOrgUnitIndents([
      unit("root", null, 1),
      unit("c4", "root", 6),
      unit("noLevel", "c4", null),
    ]);
    expect(indents.get("noLevel")).toBe(indents.get("c4")! + 1);
  });

  it("falls back to depth when nothing carries a level at all", () => {
    const indents = computeOrgUnitIndents([
      unit("root", null, null),
      unit("child", "root", null),
      unit("grandchild", "child", null),
    ]);
    expect(indents.get("root")).toBe(0);
    expect(indents.get("child")).toBe(1);
    expect(indents.get("grandchild")).toBe(2);
  });

  it("places a levelled unit by its level even when that is left of its parent", () => {
    // Faithful to the data: a unit recorded at a higher rank than its parent.
    const indents = computeOrgUnitIndents([unit("parent", null, 6), unit("child", "parent", 3)]);
    expect(indents.get("parent")).toBe(5);
    expect(indents.get("child")).toBe(2);
  });

  it("treats a unit whose parent is absent from the list as a root", () => {
    const indents = computeOrgUnitIndents([unit("orphan", "missing", null)]);
    expect(indents.get("orphan")).toBe(0);
  });

  it("does not loop forever on a cyclical parent chain", () => {
    const indents = computeOrgUnitIndents([unit("a", "b", null), unit("b", "a", null)]);
    // Neither is reachable from a root, so neither is placed — but it returns.
    expect(indents.size).toBe(0);
  });

  it("never returns a negative indent", () => {
    const indents = computeOrgUnitIndents([unit("only", null, 1)]);
    expect(indents.get("only")).toBe(0);
  });
});
