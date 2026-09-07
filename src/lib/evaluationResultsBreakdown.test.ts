import { describe, expect, it } from "vitest";
import {
  buildOrgUnitResultsTree,
  groupResultsByBand,
  UNASSIGNED_ORG_UNIT_KEY,
  type EvaluationResultForBandGrouping,
} from "./evaluationResultsBreakdown";
import { RATING_BANDS } from "./ratingBands";

describe("buildOrgUnitResultsTree", () => {
  const orgUnits = [
    { id: "root", name: "الجامعة", parentId: null },
    { id: "college", name: "الكلية", parentId: "root" },
    { id: "dept-a", name: "قسم أ", parentId: "college" },
    { id: "dept-b", name: "قسم ب", parentId: "college" },
    { id: "unrelated", name: "إدارة غير معنية", parentId: "root" },
  ];

  it("keeps only units with a direct result plus their ancestors, pruning unrelated branches", () => {
    const tree = buildOrgUnitResultsTree(orgUnits, [{ orgUnitId: "dept-a", score: 80 }], "بلا وحدة");
    // root -> college -> dept-a ; "unrelated" is nowhere in the pruned tree.
    expect(tree.map((n) => n.id)).toEqual(["root"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["college"]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["dept-a"]);
  });

  it("gives an ancestor with no direct result count 0 / average null, not a fabricated rollup", () => {
    const tree = buildOrgUnitResultsTree(orgUnits, [{ orgUnitId: "dept-a", score: 80 }], "بلا وحدة");
    const root = tree[0];
    expect(root.count).toBe(0);
    expect(root.average).toBeNull();
    const dept = root.children[0].children[0];
    expect(dept.count).toBe(1);
    expect(dept.average).toBe(80);
  });

  it("averages multiple results in the same unit and sorts children by Arabic name", () => {
    const tree = buildOrgUnitResultsTree(
      orgUnits,
      [
        { orgUnitId: "dept-b", score: 90 },
        { orgUnitId: "dept-a", score: 70 },
        { orgUnitId: "dept-a", score: 90 },
      ],
      "بلا وحدة"
    );
    const college = tree[0].children[0];
    expect(college.children.map((n) => n.id)).toEqual(
      [...college.children].sort((a, b) => a.name.localeCompare(b.name, "ar")).map((n) => n.id)
    );
    const deptA = college.children.find((n) => n.id === "dept-a")!;
    expect(deptA.count).toBe(2);
    expect(deptA.average).toBe(80);
  });

  it("ignores a null-score row entirely — never counted, never averaged", () => {
    const tree = buildOrgUnitResultsTree(orgUnits, [{ orgUnitId: "dept-a", score: null }], "بلا وحدة");
    expect(tree).toEqual([]);
  });

  it("groups employees with no org unit under a separate, clearly-labeled root", () => {
    const tree = buildOrgUnitResultsTree(orgUnits, [{ orgUnitId: null, score: 60 }], "بلا وحدة");
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: UNASSIGNED_ORG_UNIT_KEY, name: "بلا وحدة", count: 1, average: 60 });
  });

  it("returns an empty tree when there are no results at all", () => {
    expect(buildOrgUnitResultsTree(orgUnits, [], "بلا وحدة")).toEqual([]);
  });

  it("does not loop forever on a corrupted cyclical parent_id chain", () => {
    const cyclical = [
      { id: "a", name: "أ", parentId: "b" },
      { id: "b", name: "ب", parentId: "a" },
    ];
    expect(() => buildOrgUnitResultsTree(cyclical, [{ orgUnitId: "a", score: 50 }], "بلا وحدة")).not.toThrow();
  });
});

describe("groupResultsByBand", () => {
  function row(over: { bandId: EvaluationResultForBandGrouping["bandId"]; score: number | null; employeeName?: string }) {
    return {
      employeeNumber: "1",
      employeeName: over.employeeName ?? "موظف",
      orgUnitName: "وحدة",
      ...over,
    } satisfies EvaluationResultForBandGrouping;
  }

  it("always returns all five bands in RATING_BANDS order, even with zero employees", () => {
    const groups = groupResultsByBand([]);
    expect(groups.map((g) => g.bandId)).toEqual(RATING_BANDS.map((b) => b.id));
    expect(groups.every((g) => g.count === 0 && g.employees.length === 0)).toBe(true);
  });

  it("buckets each employee into their own band and computes a percentage of the SCORED total", () => {
    const groups = groupResultsByBand([
      row({ bandId: "excellent", score: 95 }),
      row({ bandId: "good", score: 75 }),
      row({ bandId: "good", score: 72 }),
    ]);
    const excellent = groups.find((g) => g.bandId === "excellent")!;
    const good = groups.find((g) => g.bandId === "good")!;
    expect(excellent.count).toBe(1);
    expect(excellent.pct).toBe(33);
    expect(good.count).toBe(2);
    expect(good.pct).toBe(67);
  });

  it("ignores an unscored row entirely, not counting it in any band or the percentage base", () => {
    const groups = groupResultsByBand([row({ bandId: null, score: null }), row({ bandId: "good", score: 75 })]);
    const good = groups.find((g) => g.bandId === "good")!;
    expect(good.count).toBe(1);
    expect(good.pct).toBe(100);
  });

  it("sorts employees within a band from highest to lowest score", () => {
    const groups = groupResultsByBand([
      row({ bandId: "good", score: 71, employeeName: "منخفض" }),
      row({ bandId: "good", score: 79, employeeName: "مرتفع" }),
    ]);
    const good = groups.find((g) => g.bandId === "good")!;
    expect(good.employees.map((e) => e.employeeName)).toEqual(["مرتفع", "منخفض"]);
  });
});
