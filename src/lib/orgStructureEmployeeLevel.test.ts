import { describe, it, expect } from "vitest";
import { buildEmployeeLevelOrderResolver, isBelowOrUnknownLevel } from "./orgStructureEmployeeLevel";

describe("buildEmployeeLevelOrderResolver", () => {
  const positionLevelOrderById = new Map([
    ["pos-ceo", 1],
    ["pos-vp", 2],
    ["pos-director", 3],
  ]);

  it("resolves an employee's level via their own position assignment", () => {
    const resolver = buildEmployeeLevelOrderResolver(
      [{ position_id: "pos-director", employee_id: "emp-1" }],
      positionLevelOrderById
    );
    expect(resolver.get("emp-1")).toBe(3);
  });

  it("does not resolve an employee with no assignment", () => {
    const resolver = buildEmployeeLevelOrderResolver([], positionLevelOrderById);
    expect(resolver.has("emp-1")).toBe(false);
  });

  it("skips an assignment pointing at a position with an unknown level", () => {
    const resolver = buildEmployeeLevelOrderResolver(
      [{ position_id: "pos-unknown", employee_id: "emp-1" }],
      positionLevelOrderById
    );
    expect(resolver.has("emp-1")).toBe(false);
  });
});

describe("isBelowOrUnknownLevel", () => {
  it("includes an employee whose own assigned position is strictly junior (higher level_order)", () => {
    const map = new Map([["emp-1", 3]]);
    expect(isBelowOrUnknownLevel("emp-1", 2, map)).toBe(true);
  });

  it("excludes an employee whose own assigned position is the same rank", () => {
    const map = new Map([["emp-1", 2]]);
    expect(isBelowOrUnknownLevel("emp-1", 2, map)).toBe(false);
  });

  it("excludes an employee whose own assigned position is more senior (lower level_order)", () => {
    const map = new Map([["emp-1", 1]]);
    expect(isBelowOrUnknownLevel("emp-1", 2, map)).toBe(false);
  });

  it("includes an employee with no known assignment (not provably above)", () => {
    const map = new Map<string, number>();
    expect(isBelowOrUnknownLevel("emp-1", 2, map)).toBe(true);
  });

  it("includes everyone when the position's own level_order is unknown", () => {
    const map = new Map([["emp-1", 1]]);
    expect(isBelowOrUnknownLevel("emp-1", undefined, map)).toBe(true);
  });
});
