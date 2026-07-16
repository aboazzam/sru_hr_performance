import { describe, it, expect } from "vitest";
import {
  orgUnits,
  buildOrgTree,
  getOrgUnitById,
  getOrgUnitChildren,
} from "./org-units";

describe("org-units data integrity", () => {
  it("has exactly 58 units (54 from the org chart + 4 colleges provided directly)", () => {
    expect(orgUnits).toHaveLength(58);
  });

  it("has unique ids", () => {
    const ids = orgUnits.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly one root (board-of-trustees)", () => {
    const roots = orgUnits.filter((u) => u.parentId === null);
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe("board-of-trustees");
  });

  it("every non-root unit's parentId references an existing unit", () => {
    const ids = new Set(orgUnits.map((u) => u.id));
    for (const unit of orgUnits) {
      if (unit.parentId !== null) {
        expect(ids.has(unit.parentId)).toBe(true);
      }
    }
  });

  it("has no cycles: every unit reaches the root in a bounded number of steps", () => {
    const byId = new Map(orgUnits.map((u) => [u.id, u]));
    for (const unit of orgUnits) {
      let current = unit;
      let steps = 0;
      while (current.parentId !== null) {
        current = byId.get(current.parentId)!;
        steps++;
        expect(steps).toBeLessThan(orgUnits.length);
      }
    }
  });

  it("buildOrgTree produces a single root node containing all 58 units", () => {
    const tree = buildOrgTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("board-of-trustees");

    function countNodes(node: (typeof tree)[number]): number {
      return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
    }
    expect(countNodes(tree[0])).toBe(58);
  });

  it("the four colleges added directly by the project owner are children of deans-of-colleges", () => {
    const colleges = getOrgUnitChildren("deans-of-colleges");
    expect(colleges.map((c) => c.name).sort()).toEqual(
      ["كلية الأعمال", "كلية التمريض", "كلية العلوم الصحية", "كلية الطب"].sort()
    );
  });

  it("getOrgUnitById finds a known unit and returns undefined for an unknown id", () => {
    expect(getOrgUnitById("president")?.name).toBe("رئيس الجامعة");
    expect(getOrgUnitById("nonexistent-unit")).toBeUndefined();
  });
});
