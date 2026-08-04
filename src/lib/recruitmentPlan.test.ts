import { describe, it, expect } from "vitest";
import {
  computeRecruitmentPlanTotals,
  recruitmentItemStatusLabel,
  recruitmentPlanStatusLabel,
  recruitmentQuarterLabels,
  recruitmentQuarters,
  recruitmentPriorities,
  recruitmentPriorityLabels,
} from "./recruitmentPlan";

describe("computeRecruitmentPlanTotals", () => {
  it("returns zeros for an empty plan", () => {
    expect(computeRecruitmentPlanTotals([])).toEqual({
      totalHeadcount: 0,
      totalMonthlyCost: 0,
      totalAnnualCost: 0,
      itemsWithoutCost: 0,
    });
  });

  it("multiplies each item's monthly cost by its headcount, then annualizes", () => {
    const totals = computeRecruitmentPlanTotals([
      { headcount: 2, estimatedMonthlyCost: 10_000 },
      { headcount: 1, estimatedMonthlyCost: 5_000 },
    ]);
    expect(totals.totalHeadcount).toBe(3);
    expect(totals.totalMonthlyCost).toBe(25_000);
    expect(totals.totalAnnualCost).toBe(300_000);
    expect(totals.itemsWithoutCost).toBe(0);
  });

  it("counts headcount but not money for items with no cost, and reports how many", () => {
    // Real case: 3 of the 44 vacant org-chart positions have no job title,
    // so no salary_scale row to seed a cost from.
    const totals = computeRecruitmentPlanTotals([
      { headcount: 4, estimatedMonthlyCost: null },
      { headcount: 1, estimatedMonthlyCost: 12_000 },
    ]);
    expect(totals.totalHeadcount).toBe(5);
    expect(totals.totalMonthlyCost).toBe(12_000);
    expect(totals.itemsWithoutCost).toBe(1);
  });

  it("treats a zero cost as a real figure, not as missing", () => {
    const totals = computeRecruitmentPlanTotals([{ headcount: 2, estimatedMonthlyCost: 0 }]);
    expect(totals.totalMonthlyCost).toBe(0);
    expect(totals.itemsWithoutCost).toBe(0);
  });
});

describe("labels", () => {
  it("has an Arabic label for every quarter and priority", () => {
    for (const q of recruitmentQuarters) expect(recruitmentQuarterLabels[q].length).toBeGreaterThan(0);
    for (const p of recruitmentPriorities) expect(recruitmentPriorityLabels[p].length).toBeGreaterThan(0);
  });

  it("falls back to the raw value for an unknown status instead of rendering undefined", () => {
    // status is plain TEXT in the DB (no CHECK enum) — an unexpected value
    // must not blank the cell out.
    expect(recruitmentItemStatusLabel("planned")).toBe("مخطط");
    expect(recruitmentItemStatusLabel("something_else")).toBe("something_else");
    expect(recruitmentPlanStatusLabel("approved")).toBe("معتمدة");
    expect(recruitmentPlanStatusLabel("archived")).toBe("archived");
  });
});
