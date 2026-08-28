import { describe, it, expect } from "vitest";
import { cycleStatus, cycleStatusLabels, cycleStatuses, todayInTimezone, totalCycleUsage, cycleDependentTables, summariseCycleScoring, isValidWeights, weightedCycleScore, evaluationMethods, evaluationMethodGroups, evaluationMethodGroupKeys, groupWeight, resolveWeights, type MethodWeights } from "./evaluationCycle";

describe("cycleStatus", () => {
  it("classifies a cycle by its own dates", () => {
    expect(cycleStatus("2026-01-01", "2026-12-31", "2025-12-31")).toBe("upcoming");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-06-15")).toBe("active");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2027-01-01")).toBe("ended");
  });

  it("treats both ends as inclusive — a cycle is active on its first and last day", () => {
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-01-01")).toBe("active");
    expect(cycleStatus("2026-01-01", "2026-12-31", "2026-12-31")).toBe("active");
  });

  it("compares dates as YYYY-MM-DD strings, so ordering holds across months", () => {
    // A naive numeric/Date comparison is where this project already hit a
    // real off-by-one-day bug; string compare on this format is safe.
    expect(cycleStatus("2026-09-01", "2026-10-31", "2026-09-30")).toBe("active");
    expect(cycleStatus("2026-09-01", "2026-10-31", "2026-11-01")).toBe("ended");
  });

  it("has an Arabic label for every status", () => {
    for (const status of cycleStatuses) expect(cycleStatusLabels[status].length).toBeGreaterThan(0);
  });
});

describe("todayInTimezone", () => {
  it("returns the calendar day in the given zone, not the server's", () => {
    // 2026-06-15T22:30Z is already the 16th in Riyadh (UTC+3).
    const instant = new Date("2026-06-15T22:30:00Z");
    expect(todayInTimezone("Asia/Riyadh", instant)).toBe("2026-06-16");
    expect(todayInTimezone("UTC", instant)).toBe("2026-06-15");
  });

  it("always produces the YYYY-MM-DD shape the `date` columns use", () => {
    expect(todayInTimezone("Asia/Riyadh", new Date("2026-01-05T09:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("totalCycleUsage", () => {
  it("sums every dependent table's count", () => {
    expect(totalCycleUsage({ evaluations: 3, goals: 2, promotions: 1 })).toBe(6);
  });

  it("is zero for a cycle nothing references", () => {
    expect(totalCycleUsage({})).toBe(0);
  });

  it("covers every table that really has a cycle_id FK", () => {
    // Guards against a new table gaining a cycle_id without the delete check
    // learning about it — the list is what both the screen and the action use.
    expect(cycleDependentTables).toContain("evaluations");
    expect(cycleDependentTables).toContain("kpi_annual_targets");
    expect(new Set(cycleDependentTables).size).toBe(cycleDependentTables.length);
  });
});

describe("summariseCycleScoring", () => {
  it("counts an evaluation as scored once, however many scores it has", () => {
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c1" },
      ],
      [
        { evaluation_id: "e1", score: 80 },
        { evaluation_id: "e1", score: 60 },
      ]
    );
    expect(s.get("c1")).toEqual({ total: 2, scored: 1, remaining: 1, averageScore: 70 });
  });

  it("averages over scores, not over evaluations", () => {
    // e1 carries three scores and e2 one: the cycle's average is the mean of
    // all four, not the mean of the two evaluations' own means.
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c1" },
      ],
      [
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e1", score: 90 },
        { evaluation_id: "e2", score: 10 },
      ]
    );
    expect(s.get("c1")?.averageScore).toBe(70);
  });

  it("reports no average at all when nothing is scored, rather than zero", () => {
    const s = summariseCycleScoring([{ id: "e1", cycle_id: "c1" }], []);
    expect(s.get("c1")).toEqual({ total: 1, scored: 0, remaining: 1, averageScore: null });
  });

  it("keeps a null score out of the average but still marks the evaluation scored", () => {
    const s = summariseCycleScoring(
      [{ id: "e1", cycle_id: "c1" }],
      [{ evaluation_id: "e1", score: null }]
    );
    expect(s.get("c1")).toEqual({ total: 1, scored: 1, remaining: 0, averageScore: null });
  });

  it("ignores a score whose evaluation is not in view", () => {
    const s = summariseCycleScoring([{ id: "e1", cycle_id: "c1" }], [{ evaluation_id: "unknown", score: 100 }]);
    expect(s.get("c1")).toEqual({ total: 1, scored: 0, remaining: 1, averageScore: null });
  });

  it("keeps cycles apart", () => {
    const s = summariseCycleScoring(
      [
        { id: "e1", cycle_id: "c1" },
        { id: "e2", cycle_id: "c2" },
      ],
      [
        { evaluation_id: "e1", score: 100 },
        { evaluation_id: "e2", score: 50 },
      ]
    );
    expect(s.get("c1")?.averageScore).toBe(100);
    expect(s.get("c2")?.averageScore).toBe(50);
  });
});

describe("method weights", () => {
  const even: MethodWeights = { activities: 25, competencies: 25, bau: 25, feedback360: 25 };

  it("accepts a distribution totalling 100", () => {
    expect(isValidWeights(even)).toBe(true);
    expect(isValidWeights({ activities: 40, competencies: 30, bau: 20, feedback360: 10 })).toBe(true);
  });

  it("rejects a distribution that does not total 100", () => {
    expect(isValidWeights({ activities: 40, competencies: 30, bau: 20, feedback360: 20 })).toBe(false);
    expect(isValidWeights({ activities: 0, competencies: 0, bau: 0, feedback360: 0 })).toBe(false);
  });

  it("rejects an out-of-range weight even when the total works out", () => {
    expect(isValidWeights({ activities: 110, competencies: 0, bau: 0, feedback360: -10 })).toBe(false);
  });

  it("weights the methods that have scores", () => {
    const result = weightedCycleScore({ activities: 50, competencies: 50, bau: 0, feedback360: 0 }, {
      activities: 80,
      competencies: 60,
    });
    expect(result.score).toBe(70);
    expect(result.appliedWeight).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("renormalises over what exists instead of scoring a missing method as zero", () => {
    const result = weightedCycleScore(
      { activities: 40, competencies: 30, bau: 20, feedback360: 10 },
      { activities: 90, competencies: 70 }
    );
    // (90*40 + 70*30) / 70 — not /100, which would have read as 79.
    expect(result.score).toBeCloseTo(81.4285, 3);
    expect(result.appliedWeight).toBe(70);
    expect(result.missing).toEqual(["bau", "feedback360"]);
  });

  it("returns null, not zero, when nothing is scored yet", () => {
    const result = weightedCycleScore(even, {});
    expect(result.score).toBeNull();
    expect(result.appliedWeight).toBe(0);
  });

  it("ignores a method carrying no weight, scored or not", () => {
    const result = weightedCycleScore({ activities: 100, competencies: 0, bau: 0, feedback360: 0 }, {
      activities: 50,
      competencies: 100,
    });
    expect(result.score).toBe(50);
    expect(result.missing).toEqual([]);
  });
});

describe("method groups and per-department resolution", () => {
  const even: MethodWeights = { activities: 25, bau: 25, competencies: 25, feedback360: 25 };

  it("groups the four methods into results and behaviour", () => {
    expect(evaluationMethodGroups.results).toEqual(["activities", "bau"]);
    expect(evaluationMethodGroups.behaviour).toEqual(["competencies", "feedback360"]);
  });

  it("covers every method exactly once across the groups", () => {
    const covered = evaluationMethodGroupKeys.flatMap((group) => [...evaluationMethodGroups[group]]);
    expect([...covered].sort()).toEqual([...evaluationMethods].sort());
    expect(new Set(covered).size).toBe(evaluationMethods.length);
  });

  it("sums a group from its own leaves rather than storing it", () => {
    const weights: MethodWeights = { activities: 40, bau: 20, competencies: 30, feedback360: 10 };
    expect(groupWeight(weights, "results")).toBe(60);
    expect(groupWeight(weights, "behaviour")).toBe(40);
    expect(groupWeight(weights, "results") + groupWeight(weights, "behaviour")).toBe(100);
  });

  it("prefers the department's own distribution over the cycle's", () => {
    const own: MethodWeights = { activities: 70, bau: 10, competencies: 10, feedback360: 10 };
    expect(resolveWeights(even, own)).toEqual({ weights: own, source: "orgUnit" });
  });

  it("falls back to the cycle when the department has none", () => {
    expect(resolveWeights(even, null)).toEqual({ weights: even, source: "cycle" });
    expect(resolveWeights(even, undefined).source).toBe("cycle");
  });

  it("falls back rather than applying a department distribution that does not total 100", () => {
    const broken: MethodWeights = { activities: 70, bau: 10, competencies: 10, feedback360: 40 };
    expect(resolveWeights(even, broken)).toEqual({ weights: even, source: "cycle" });
  });
});
