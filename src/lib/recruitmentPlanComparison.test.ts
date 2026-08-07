import { describe, expect, it } from "vitest";
import { comparePlans } from "./recruitmentPlanComparison";
import type { DistributionRow } from "./recruitmentPlanAnalytics";

const row = (
  key: string,
  headcount: number,
  annualCost: number
): DistributionRow => ({
  key,
  label: key,
  headcount,
  monthlyCost: annualCost / 12,
  annualCost,
  headcountPercentage: 0,
});

describe("comparePlans", () => {
  it("computes both deltas per org unit", () => {
    const rows = comparePlans([row("أ", 5, 60_000)], [row("أ", 3, 36_000)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      previousHeadcount: 3,
      currentHeadcount: 5,
      headcountDelta: 2,
      previousAnnualCost: 36_000,
      currentAnnualCost: 60_000,
      annualCostDelta: 24_000,
    });
  });

  it("keeps a unit that appears for the first time this year", () => {
    const rows = comparePlans([row("جديدة", 4, 48_000)], []);
    expect(rows[0]).toMatchObject({
      previousHeadcount: 0,
      currentHeadcount: 4,
      headcountDelta: 4,
    });
  });

  it("keeps a unit that dropped out entirely, as a negative delta", () => {
    const rows = comparePlans([], [row("منتهية", 6, 72_000)]);
    expect(rows[0]).toMatchObject({
      previousHeadcount: 6,
      currentHeadcount: 0,
      headcountDelta: -6,
      annualCostDelta: -72_000,
    });
  });

  it("does not double-count a unit present in both years", () => {
    const rows = comparePlans(
      [row("أ", 1, 12_000), row("ب", 2, 24_000)],
      [row("أ", 1, 12_000), row("ج", 3, 36_000)]
    );
    expect(rows.map((r) => r.key).sort()).toEqual(["أ", "ب", "ج"]);
    expect(rows).toHaveLength(3);
  });

  it("leads with the biggest movement in either direction", () => {
    const rows = comparePlans(
      [row("صغير", 2, 0), row("كبير", 10, 0)],
      [row("صغير", 1, 0), row("كبير", 1, 0)]
    );
    expect(rows[0].key).toBe("كبير");

    // A large DROP must lead just as a large rise does — it is equally the
    // thing a year-over-year table exists to surface.
    const withDrop = comparePlans([row("أ", 1, 0)], [row("أ", 1, 0), row("ب", 20, 0)]);
    expect(withDrop[0].key).toBe("ب");
    expect(withDrop[0].headcountDelta).toBe(-20);
  });

  it("returns nothing when both plans are empty", () => {
    expect(comparePlans([], [])).toEqual([]);
  });

  it("reports a zero delta for a unit that did not change", () => {
    const rows = comparePlans([row("ثابتة", 3, 36_000)], [row("ثابتة", 3, 36_000)]);
    expect(rows[0].headcountDelta).toBe(0);
    expect(rows[0].annualCostDelta).toBe(0);
  });
});
