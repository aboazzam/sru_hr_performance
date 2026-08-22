import { describe, expect, it } from "vitest";
import { planAchievement } from "./planAchievement";

describe("planAchievement", () => {
  it("says nothing rather than 0% when nothing is measured", () => {
    const result = planAchievement({ kpis: [{ weight: 50, targetValue: 100 }], initiatives: [{}, {}] });
    expect(result).toEqual({ percent: 0, kind: "none", reported: 0, total: 2 });
  });

  it("prefers KPI actuals over initiative progress", () => {
    const result = planAchievement({
      kpis: [{ weight: 1, targetValue: 100, actualValue: 80 }],
      initiatives: [{ progressPercent: 5 }],
    });
    expect(result.kind).toBe("kpi");
    expect(result.percent).toBe(80);
  });

  it("weights KPIs when every measured one has a positive weight", () => {
    const result = planAchievement({
      kpis: [
        { weight: 75, targetValue: 100, actualValue: 100 },
        { weight: 25, targetValue: 100, actualValue: 0 },
      ],
    });
    expect(result.percent).toBe(75);
  });

  it("falls back to equal weighting when a weight is missing", () => {
    const result = planAchievement({
      kpis: [
        { weight: null, targetValue: 100, actualValue: 100 },
        { weight: 25, targetValue: 100, actualValue: 0 },
      ],
    });
    expect(result.percent).toBe(50);
  });

  it("ignores a KPI whose target is zero instead of dividing by it", () => {
    const result = planAchievement({
      kpis: [
        { weight: 1, targetValue: 0, actualValue: 5 },
        { weight: 1, targetValue: 100, actualValue: 40 },
      ],
    });
    expect(result.reported).toBe(1);
    expect(result.percent).toBe(40);
  });

  it("caps an over-achieved KPI at 100", () => {
    const result = planAchievement({ kpis: [{ weight: 1, targetValue: 100, actualValue: 250 }] });
    expect(result.percent).toBe(100);
  });

  it("averages only the initiatives that reported, and says how many", () => {
    const result = planAchievement({ initiatives: [{ progressPercent: 40 }, {}, {}] });
    expect(result).toEqual({ percent: 40, kind: "initiatives", reported: 1, total: 3 });
  });

  it("treats a done initiative as 100 with no percentage typed", () => {
    const result = planAchievement({ initiatives: [{ statusCode: "done" }, { progressPercent: 50 }] });
    expect(result.percent).toBe(75);
    expect(result.reported).toBe(2);
  });

  it("handles the numeric strings PostgREST returns for NUMERIC columns", () => {
    const result = planAchievement({ kpis: [{ weight: "2", targetValue: "50", actualValue: "25" }] });
    expect(result).toEqual({ percent: 50, kind: "kpi", reported: 1, total: 1 });
  });
});
