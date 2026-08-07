import { describe, expect, it } from "vitest";
import { computeRecruitmentPlanTotals } from "./recruitmentPlan";
import {
  UNSPECIFIED_GROUP_LABEL,
  computeBudgetVariance,
  computeDistribution,
  contractTypeLabel,
  quarterLabel,
  type DistributionItem,
} from "./recruitmentPlanAnalytics";

describe("computeBudgetVariance", () => {
  it("reports no_budget rather than a fake zero variance when finance has not set one", () => {
    const result = computeBudgetVariance(500_000, null);
    expect(result.status).toBe("no_budget");
    // Null, never 0 — a 0 here would render as "exactly on budget".
    expect(result.variance).toBeNull();
    expect(result.consumedPercentage).toBeNull();
  });

  it("reports room left when the plan costs less than the approved budget", () => {
    const result = computeBudgetVariance(400_000, 500_000);
    expect(result.status).toBe("under");
    expect(result.variance).toBe(100_000);
    expect(result.consumedPercentage).toBeCloseTo(80);
  });

  it("reports an overrun when the plan costs more", () => {
    const result = computeBudgetVariance(600_000, 500_000);
    expect(result.status).toBe("over");
    expect(result.variance).toBe(-100_000);
    expect(result.consumedPercentage).toBeCloseTo(120);
  });

  it("distinguishes exactly on budget from both directions", () => {
    const result = computeBudgetVariance(500_000, 500_000);
    expect(result.status).toBe("exact");
    expect(result.variance).toBe(0);
    expect(result.consumedPercentage).toBeCloseTo(100);
  });

  it("never divides by a zero budget", () => {
    // Nothing granted and nothing planned: 0% consumed, not NaN.
    const empty = computeBudgetVariance(0, 0);
    expect(empty.status).toBe("exact");
    expect(empty.consumedPercentage).toBe(0);

    // Nothing granted but something planned: a real overrun, and the
    // percentage is genuinely undefined rather than Infinity.
    const overrun = computeBudgetVariance(1000, 0);
    expect(overrun.status).toBe("over");
    expect(overrun.variance).toBe(-1000);
    expect(overrun.consumedPercentage).toBeNull();
  });
});

describe("computeDistribution", () => {
  const items: DistributionItem[] = [
    { headcount: 3, estimatedMonthlyCost: 1000, groupKey: "a", groupLabel: "إدارة أ" },
    { headcount: 1, estimatedMonthlyCost: 2000, groupKey: "a", groupLabel: "إدارة أ" },
    { headcount: 2, estimatedMonthlyCost: 500, groupKey: "b", groupLabel: "إدارة ب" },
    { headcount: 4, estimatedMonthlyCost: null, groupKey: null, groupLabel: null },
  ];

  it("sums headcount and cost per group", () => {
    const rows = computeDistribution(items);
    const a = rows.find((row) => row.key === "a")!;
    // 3 x 1000 + 1 x 2000 — cost is per position, multiplied by headcount.
    expect(a.headcount).toBe(4);
    expect(a.monthlyCost).toBe(5000);
    expect(a.annualCost).toBe(60_000);
  });

  it("buckets items with no group value instead of dropping them", () => {
    const rows = computeDistribution(items);
    const unspecified = rows.find((row) => row.label === UNSPECIFIED_GROUP_LABEL)!;
    expect(unspecified.headcount).toBe(4);
    // The distribution's headcount must reconcile with the plan's own total,
    // or the dashboard would contradict the header card.
    expect(rows.reduce((sum, row) => sum + row.headcount, 0)).toBe(
      computeRecruitmentPlanTotals(items).totalHeadcount
    );
  });

  it("treats a blank-string group key as unspecified too", () => {
    const rows = computeDistribution([
      { headcount: 1, estimatedMonthlyCost: null, groupKey: "   ", groupLabel: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe(UNSPECIFIED_GROUP_LABEL);
  });

  it("ignores a null cost without corrupting the group's total", () => {
    const rows = computeDistribution([
      { headcount: 2, estimatedMonthlyCost: 100, groupKey: "a", groupLabel: "أ" },
      { headcount: 5, estimatedMonthlyCost: null, groupKey: "a", groupLabel: "أ" },
    ]);
    expect(rows[0].headcount).toBe(7);
    expect(rows[0].monthlyCost).toBe(200);
  });

  it("computes each group's share of total headcount", () => {
    const rows = computeDistribution(items);
    const total = rows.reduce((sum, row) => sum + row.headcountPercentage, 0);
    expect(total).toBeCloseTo(100);
  });

  it("sorts by headcount descending", () => {
    const rows = computeDistribution(items);
    const counts = rows.map((row) => row.headcount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("returns nothing for an empty plan and does not divide by zero", () => {
    expect(computeDistribution([])).toEqual([]);
  });
});

describe("labels", () => {
  it("labels every contract type and falls back to the raw value", () => {
    expect(contractTypeLabel("permanent")).toBe("دائم");
    expect(contractTypeLabel("temporary")).toBe("مؤقت");
    expect(contractTypeLabel("part_time")).toBe("دوام جزئي");
    expect(contractTypeLabel("something_new")).toBe("something_new");
    expect(contractTypeLabel(null)).toBe(UNSPECIFIED_GROUP_LABEL);
  });

  it("labels quarters and handles a missing one", () => {
    expect(quarterLabel(1)).toBe("الربع الأول");
    expect(quarterLabel(4)).toBe("الربع الرابع");
    expect(quarterLabel(null)).toBe(UNSPECIFIED_GROUP_LABEL);
  });
});
