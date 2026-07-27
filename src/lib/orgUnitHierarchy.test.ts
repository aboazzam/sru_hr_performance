import { describe, it, expect } from "vitest";
import { buildDescendantOrgUnitIdsResolver } from "./orgUnitHierarchy";

describe("buildDescendantOrgUnitIdsResolver", () => {
  const orgUnits = [
    { id: "root", parent_id: null },
    { id: "child-a", parent_id: "root" },
    { id: "child-b", parent_id: "root" },
    { id: "grandchild", parent_id: "child-a" },
    { id: "unrelated", parent_id: null },
  ];

  it("includes the root id itself even with no children", () => {
    const descendants = buildDescendantOrgUnitIdsResolver(orgUnits);
    expect(descendants("grandchild")).toEqual(new Set(["grandchild"]));
  });

  it("includes direct and transitive descendants", () => {
    const descendants = buildDescendantOrgUnitIdsResolver(orgUnits);
    expect(descendants("root")).toEqual(new Set(["root", "child-a", "child-b", "grandchild"]));
  });

  it("does not include unrelated units or ancestors", () => {
    const descendants = buildDescendantOrgUnitIdsResolver(orgUnits);
    const result = descendants("child-a");
    expect(result).toEqual(new Set(["child-a", "grandchild"]));
    expect(result.has("root")).toBe(false);
    expect(result.has("unrelated")).toBe(false);
  });

  it("does not loop forever on a corrupted cyclical parent_id chain", () => {
    const cyclical = [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ];
    const descendants = buildDescendantOrgUnitIdsResolver(cyclical);
    expect(descendants("a")).toEqual(new Set(["a", "b"]));
  });
});
