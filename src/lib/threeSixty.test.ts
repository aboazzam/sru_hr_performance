import { describe, it, expect } from "vitest";
import {
  itemsForRelationship,
  validateNominationCounts,
  reverseAdjustedValue,
  aggregateCompetencyScores,
  groupCompletionStats,
  visibleGroupBreakdown,
  type ThreeSixtyItem,
  type ThreeSixtyRaterGroup,
} from "./threeSixty";

function item(overrides: Partial<ThreeSixtyItem>): ThreeSixtyItem {
  return {
    id: "i1",
    itemCode: "Q1",
    competencyId: "c1",
    itemType: "rating",
    raterGroups: ["peer"],
    required: true,
    reverseScored: false,
    scaleCode: "freq",
    displayOrder: 0,
    ...overrides,
  };
}

function raterGroup(overrides: Partial<ThreeSixtyRaterGroup>): ThreeSixtyRaterGroup {
  return {
    relationshipCode: "peer",
    nameAr: "زميل",
    minRatersInGroup: 0,
    maxRatersInGroup: null,
    shownSeparately: false,
    employeeMayNominate: true,
    ...overrides,
  };
}

describe("itemsForRelationship", () => {
  it("keeps only items whose rater_groups includes the given relationship", () => {
    const items = [
      item({ id: "a", raterGroups: ["peer", "subordinate"], displayOrder: 2 }),
      item({ id: "b", raterGroups: ["supervisor"], displayOrder: 1 }),
      item({ id: "c", raterGroups: ["peer"], displayOrder: 1 }),
    ];
    const result = itemsForRelationship(items, "peer");
    expect(result.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("returns an empty list when nothing applies to the relationship", () => {
    const items = [item({ raterGroups: ["supervisor"] })];
    expect(itemsForRelationship(items, "peer")).toEqual([]);
  });

  it("sorts by display_order ascending", () => {
    const items = [
      item({ id: "z", displayOrder: 5 }),
      item({ id: "a", displayOrder: 1 }),
      item({ id: "m", displayOrder: 3 }),
    ];
    expect(itemsForRelationship(items, "peer").map((i) => i.id)).toEqual(["a", "m", "z"]);
  });
});

describe("validateNominationCounts", () => {
  const raterGroups = [
    raterGroup({ relationshipCode: "peer", nameAr: "زميل", minRatersInGroup: 2, maxRatersInGroup: 4 }),
    raterGroup({
      relationshipCode: "subordinate",
      nameAr: "مرؤوس",
      minRatersInGroup: 1,
      maxRatersInGroup: 3,
    }),
    // Not nominate-able -- e.g. supervisor is system-assigned -- must be
    // ignored by the per-group checks even if absent from `counts`.
    raterGroup({ relationshipCode: "supervisor", nameAr: "رئيس مباشر", employeeMayNominate: false, minRatersInGroup: 1 }),
  ];

  it("passes when every bound is satisfied", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 3, subordinate: 1 } },
      cycle: { minRaters: 3, maxRaters: 8 },
      raterGroups,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalNominated).toBe(4);
  });

  it("fails when the overall total is below the cycle minimum", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 2 } },
      cycle: { minRaters: 5, maxRaters: null },
      raterGroups,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("الحد الأدنى المطلوب"))).toBe(true);
  });

  it("fails when the overall total exceeds the cycle maximum", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 4, subordinate: 3 } },
      cycle: { minRaters: 1, maxRaters: 5 },
      raterGroups,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("الحد الأقصى المسموح به"))).toBe(true);
  });

  it("fails when a nominate-able group is below its own minimum", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 1, subordinate: 1 } },
      cycle: { minRaters: 1, maxRaters: null },
      raterGroups,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('"زميل"') && e.includes("الحد الأدنى لهذه الفئة"))).toBe(true);
  });

  it("fails when a nominate-able group exceeds its own maximum", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 2, subordinate: 5 } },
      cycle: { minRaters: 1, maxRaters: null },
      raterGroups,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('"مرؤوس"') && e.includes("الحد الأقصى لهذه الفئة"))).toBe(true);
  });

  it("never checks a group the employee may not nominate for, even at zero", () => {
    const result = validateNominationCounts({
      counts: { byGroup: { peer: 2, subordinate: 1 } },
      cycle: { minRaters: 1, maxRaters: null },
      raterGroups,
    });
    expect(result.errors.some((e) => e.includes("رئيس مباشر"))).toBe(false);
  });
});

describe("reverseAdjustedValue", () => {
  it("returns the raw value when not reverse scored", () => {
    expect(reverseAdjustedValue(4, 1, 5, false)).toBe(4);
  });

  it("mirrors the value around the scale midpoint when reverse scored", () => {
    // scale 1..5: 1<->5, 2<->4, 3<->3
    expect(reverseAdjustedValue(1, 1, 5, true)).toBe(5);
    expect(reverseAdjustedValue(5, 1, 5, true)).toBe(1);
    expect(reverseAdjustedValue(3, 1, 5, true)).toBe(3);
  });
});

describe("aggregateCompetencyScores", () => {
  it("averages counted responses per competency, applying reverse scoring first", () => {
    const scores = aggregateCompetencyScores([
      { competencyId: "c1", numericValue: 4, reverseScored: false, scaleMin: 1, scaleMax: 5, countedInScore: true },
      { competencyId: "c1", numericValue: 2, reverseScored: true, scaleMin: 1, scaleMax: 5, countedInScore: true }, // adjusted to 4
      { competencyId: "c2", numericValue: 3, reverseScored: false, scaleMin: 1, scaleMax: 5, countedInScore: true },
    ]);
    expect(scores.get("c1")).toBe(4);
    expect(scores.get("c2")).toBe(3);
  });

  it("ignores responses not counted in the score", () => {
    const scores = aggregateCompetencyScores([
      { competencyId: "c1", numericValue: 1, reverseScored: false, scaleMin: 1, scaleMax: 5, countedInScore: false },
    ]);
    expect(scores.has("c1")).toBe(false);
  });

  it("returns an empty map for no responses", () => {
    expect(aggregateCompetencyScores([]).size).toBe(0);
  });
});

describe("groupCompletionStats", () => {
  it("counts total and submitted per relationship, excluding excluded assignments", () => {
    const stats = groupCompletionStats([
      { relationshipCode: "peer", status: "submitted" },
      { relationshipCode: "peer", status: "pending" },
      { relationshipCode: "peer", status: "excluded" },
      { relationshipCode: "supervisor", status: "submitted" },
    ]);
    const peer = stats.find((s) => s.relationshipCode === "peer")!;
    expect(peer.total).toBe(2);
    expect(peer.submitted).toBe(1);
    const supervisor = stats.find((s) => s.relationshipCode === "supervisor")!;
    expect(supervisor.total).toBe(1);
    expect(supervisor.submitted).toBe(1);
  });
});

describe("visibleGroupBreakdown", () => {
  const raterGroups = [
    raterGroup({ relationshipCode: "peer", shownSeparately: true, minRatersInGroup: 3 }),
    raterGroup({ relationshipCode: "supervisor", shownSeparately: true, minRatersInGroup: 1 }),
    raterGroup({ relationshipCode: "subordinate", shownSeparately: false, minRatersInGroup: 0 }),
  ];

  it("shows a group only when shown_separately AND the k-anonymity floor is met", () => {
    const { visible, folded } = visibleGroupBreakdown(raterGroups, [
      { relationshipCode: "peer", total: 4, submitted: 2 }, // below min_raters_in_group=3
      { relationshipCode: "supervisor", total: 1, submitted: 1 }, // meets min=1
      { relationshipCode: "subordinate", total: 2, submitted: 2 }, // not shown_separately at all
    ]);
    expect(visible.map((s) => s.relationshipCode)).toEqual(["supervisor"]);
    expect(folded.map((s) => s.relationshipCode).sort()).toEqual(["peer", "subordinate"]);
  });

  it("folds a stat for a relationship with no matching catalog row rather than crashing", () => {
    const { visible, folded } = visibleGroupBreakdown(raterGroups, [
      { relationshipCode: "unknown", total: 1, submitted: 1 },
    ]);
    expect(visible).toEqual([]);
    expect(folded).toHaveLength(1);
  });
});
