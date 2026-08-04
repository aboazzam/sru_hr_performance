import { describe, it, expect } from "vitest";
import { computeDescendantPositionIds, computeEligibleParentPositions, isRootLevelOrder } from "./orgStructurePositions";

const levels = [
  { id: "L1", level_order: 1 },
  { id: "L2", level_order: 2 },
  { id: "L3", level_order: 3 },
  { id: "L4", level_order: 4 },
];

// A small 4-level tree: ceo -> deputy -> manager -> analyst, plus a sibling
// "director" reporting directly to ceo (skipping deputy).
const positions = [
  { id: "ceo", level_id: "L1", parent_id: null },
  { id: "deputy", level_id: "L2", parent_id: "ceo" },
  { id: "director", level_id: "L3", parent_id: "ceo" },
  { id: "manager", level_id: "L3", parent_id: "deputy" },
  { id: "analyst", level_id: "L4", parent_id: "manager" },
];

describe("isRootLevelOrder", () => {
  it("is true only for the minimum level_order", () => {
    expect(isRootLevelOrder(1, levels)).toBe(true);
    expect(isRootLevelOrder(2, levels)).toBe(false);
  });

  it("is false when the level is unknown or there are no levels", () => {
    expect(isRootLevelOrder(undefined, levels)).toBe(false);
    expect(isRootLevelOrder(1, [])).toBe(false);
  });
});

describe("computeDescendantPositionIds", () => {
  it("includes direct and transitive descendants, excluding the position itself", () => {
    const result = computeDescendantPositionIds("deputy", positions);
    expect(result).toEqual(new Set(["manager", "analyst"]));
  });

  it("returns an empty set for a leaf position", () => {
    expect(computeDescendantPositionIds("analyst", positions)).toEqual(new Set());
  });

  it("does not loop forever on a corrupted cyclical parent_id chain", () => {
    const cyclical = [
      { id: "a", level_id: "L1", parent_id: "b" },
      { id: "b", level_id: "L2", parent_id: "a" },
    ];
    expect(computeDescendantPositionIds("a", cyclical)).toEqual(new Set(["b"]));
  });
});

describe("computeEligibleParentPositions", () => {
  it("only offers positions at a strictly lower level_order", () => {
    const options = computeEligibleParentPositions("manager", 3, levels, positions);
    expect(options.map((p) => p.id).sort()).toEqual(["ceo", "deputy"]);
  });

  it("excludes the position's own descendants even if they would otherwise qualify by level", () => {
    // "deputy" is level 2; its own descendant "manager"/"analyst" are level
    // 3/4, so the level filter alone already excludes them here -- this
    // instead exercises the exclusion directly via computeDescendantPositionIds
    // by asking for manager's own descendant, analyst, as a candidate parent
    // for something at a level BELOW analyst's, which the level filter
    // would otherwise allow.
    const positionsWithLowerAnalyst = [...positions, { id: "successor", level_id: "L1", parent_id: null }];
    const options = computeEligibleParentPositions("ceo", 1, levels, positionsWithLowerAnalyst);
    // ceo has no eligible parent at all (nothing above level 1).
    expect(options).toEqual([]);
  });

  it("excludes the position itself", () => {
    const options = computeEligibleParentPositions("deputy", 2, levels, positions);
    expect(options.some((p) => p.id === "deputy")).toBe(false);
  });

  it("sorts closest level first", () => {
    const options = computeEligibleParentPositions("analyst", 4, levels, positions);
    // director/manager are level 3 (closest), deputy is level 2, ceo is level 1.
    expect(options.map((p) => p.id)).toEqual(["director", "manager", "deputy", "ceo"]);
  });

  it("returns an empty list for a root-level position (nothing is above it)", () => {
    expect(computeEligibleParentPositions("ceo", 1, levels, positions)).toEqual([]);
  });
});
