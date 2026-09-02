import { describe, expect, it } from "vitest";
import { buildStaffingGroups, compareUnits, type OrgUnitRef, type StaffingPosition } from "./staffingUnitTree";

function pos(id: string, orgUnitId: string | null): StaffingPosition {
  return { id, nameAr: `position-${id}`, nameEn: null, orgUnitId };
}

function unit(id: string, nameAr: string, parentId: string | null, sortOrder = 0): OrgUnitRef {
  return { id, nameAr, parentId, sortOrder };
}

describe("buildStaffingGroups", () => {
  it("keeps a unit with no anchor match fully flat", () => {
    const units = [unit("a", "وحدة أ", null)];
    const result = buildStaffingGroups([pos("p1", "a")], units, "غير موجود");
    expect(result.nestedRoots).toEqual([]);
    expect(result.flatGroups).toEqual([{ id: "a", name: "وحدة أ", positions: [pos("p1", "a")], sortOrder: 0 }]);
    expect(result.unlinkedPositions).toEqual([]);
  });

  it("nests a direct child of the anchor with its own position, no children", () => {
    const units = [unit("anchor", "رئيس الجامعة", null), unit("dept", "إدارة", "anchor")];
    const result = buildStaffingGroups([pos("p1", "dept")], units, "رئيس الجامعة");
    expect(result.flatGroups).toEqual([]);
    expect(result.nestedRoots).toEqual([{ id: "dept", name: "إدارة", positions: [pos("p1", "dept")], children: [], sortOrder: 0 }]);
  });

  it("wraps a grandchild's position inside the direct-child root, even when the root itself has no own position", () => {
    // Mirrors نائب الرئيس: no position of its own, but its child (وفق
    // ذلك المكتب) does -- the root card still has to exist to hold it.
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("vp", "نائب الرئيس", "anchor"),
      unit("office", "مكتب النائب", "vp"),
    ];
    const result = buildStaffingGroups([pos("p1", "office")], units, "رئيس الجامعة");
    expect(result.nestedRoots).toEqual([
      {
        id: "vp",
        name: "نائب الرئيس",
        positions: [],
        sortOrder: 0,
        children: [{ id: "office", name: "مكتب النائب", positions: [pos("p1", "office")], children: [], sortOrder: 0 }],
      },
    ]);
  });

  it("builds three levels of nesting -- card inside card inside card", () => {
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("vp", "نائب الرئيس", "anchor"),
      unit("avp", "النائب المساعد", "vp"),
      unit("office", "مكتب النائب المساعد", "avp"),
    ];
    const result = buildStaffingGroups([pos("p1", "office"), pos("p2", "avp")], units, "رئيس الجامعة");
    expect(result.nestedRoots).toHaveLength(1);
    const [root] = result.nestedRoots;
    expect(root.id).toBe("vp");
    expect(root.children).toHaveLength(1);
    expect(root.children[0].id).toBe("avp");
    expect(root.children[0].positions).toEqual([pos("p2", "avp")]);
    expect(root.children[0].children).toEqual([
      { id: "office", name: "مكتب النائب المساعد", positions: [pos("p1", "office")], children: [], sortOrder: 0 },
    ]);
  });

  it("prunes a branch with no positions anywhere in its subtree", () => {
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("dept", "إدارة", "anchor"),
      unit("empty-child", "فرع فارغ", "dept"),
    ];
    const result = buildStaffingGroups([pos("p1", "dept")], units, "رئيس الجامعة");
    expect(result.nestedRoots).toEqual([{ id: "dept", name: "إدارة", positions: [pos("p1", "dept")], children: [], sortOrder: 0 }]);
  });

  it("keeps a unit outside the anchor's subtree flat, unaffected by nesting", () => {
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("dept", "إدارة تابعة", "anchor"),
      unit("council", "مجلس منفصل", null),
    ];
    const result = buildStaffingGroups([pos("p1", "dept"), pos("p2", "council")], units, "رئيس الجامعة");
    expect(result.nestedRoots).toEqual([{ id: "dept", name: "إدارة تابعة", positions: [pos("p1", "dept")], children: [], sortOrder: 0 }]);
    expect(result.flatGroups).toEqual([{ id: "council", name: "مجلس منفصل", positions: [pos("p2", "council")], sortOrder: 0 }]);
  });

  it("collects positions with no org unit, or one that isn't in the given list, as unlinked", () => {
    const units = [unit("a", "وحدة", null)];
    const result = buildStaffingGroups([pos("p1", null), pos("p2", "missing-unit")], units, "وحدة");
    expect(result.unlinkedPositions.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(result.nestedRoots).toEqual([]);
    expect(result.flatGroups).toEqual([]);
  });

  it("falls back to fully flat grouping when the anchor name isn't found", () => {
    const units = [unit("a", "إدارة أ", null), unit("b", "إدارة ب", "a")];
    const result = buildStaffingGroups([pos("p1", "a"), pos("p2", "b")], units, "غير موجود إطلاقًا");
    expect(result.nestedRoots).toEqual([]);
    expect(result.flatGroups.map((g) => g.id).sort()).toEqual(["a", "b"]);
  });

  it("does not hang on a corrupted cyclical parent_id chain", () => {
    // a -> b -> a, neither ever reaching the anchor.
    const units = [unit("anchor", "رئيس الجامعة", null), unit("a", "أ", "b"), unit("b", "ب", "a")];
    const result = buildStaffingGroups([pos("p1", "a")], units, "رئيس الجامعة");
    // No anchor match on this cyclical branch -- falls back to flat, not a hang.
    expect(result.flatGroups).toEqual([{ id: "a", name: "أ", positions: [pos("p1", "a")], sortOrder: 0 }]);
    expect(result.nestedRoots).toEqual([]);
  });

  it("sorts nested roots and flat groups alphabetically (Arabic collation) when sortOrder ties", () => {
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("z", "ياء إدارة", "anchor"),
      unit("a", "أ إدارة", "anchor"),
    ];
    const result = buildStaffingGroups([pos("p1", "z"), pos("p2", "a")], units, "رئيس الجامعة");
    expect(result.nestedRoots.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("orders children within a card by sortOrder before falling back to alphabetical", () => {
    // "ياء" would sort after "أ" alphabetically, but a lower sortOrder wins.
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("parent", "أب", "anchor"),
      unit("z", "ياء إدارة", "parent", 1),
      unit("a", "أ إدارة", "parent", 2),
    ];
    const result = buildStaffingGroups([pos("p1", "z"), pos("p2", "a")], units, "رئيس الجامعة");
    expect(result.nestedRoots[0].children.map((c) => c.id)).toEqual(["z", "a"]);
  });

  it("orders top-level nested roots by sortOrder before falling back to alphabetical", () => {
    const units = [
      unit("anchor", "رئيس الجامعة", null),
      unit("z", "ياء إدارة", "anchor", 1),
      unit("a", "أ إدارة", "anchor", 2),
    ];
    const result = buildStaffingGroups([pos("p1", "z"), pos("p2", "a")], units, "رئيس الجامعة");
    expect(result.nestedRoots.map((r) => r.id)).toEqual(["z", "a"]);
  });
});

describe("compareUnits", () => {
  it("orders by sortOrder first", () => {
    expect(compareUnits({ sortOrder: 2, name: "أ" }, { sortOrder: 1, name: "ب" })).toBeGreaterThan(0);
  });

  it("falls back to Arabic alphabetical order when sortOrder ties", () => {
    expect(compareUnits({ sortOrder: 0, name: "ب" }, { sortOrder: 0, name: "أ" })).toBeGreaterThan(0);
  });
});
