import { describe, it, expect } from "vitest";
import { averageScores, computeEmployeeCycleResult } from "./evaluationResult";
import type { MethodWeights } from "./evaluationCycle";

describe("averageScores", () => {
  it("averages only the real numeric values", () => {
    expect(averageScores([80, 90, 100])).toBe(90);
  });

  it("ignores null/undefined without treating them as zero", () => {
    expect(averageScores([80, null, undefined, 100])).toBe(90);
  });

  it("returns null when nothing scorable exists", () => {
    expect(averageScores([])).toBeNull();
    expect(averageScores([null, undefined])).toBeNull();
  });
});

const EQUAL_WEIGHTS: MethodWeights = { activities: 25, competencies: 25, bau: 25, feedback360: 25 };

describe("computeEmployeeCycleResult", () => {
  it("computes the weighted score across all four methods when everything is present", () => {
    const result = computeEmployeeCycleResult({
      employeeId: "emp-1",
      evaluationId: "eval-1",
      orgUnitId: "unit-1",
      cycleWeights: EQUAL_WEIGHTS,
      orgUnitWeights: null,
      inputs: {
        activityScores: [80, 90],
        competencyScores: [70],
        bauTaskScores: [100],
        feedback360Percent: 60,
      },
    });
    // (85+70+100+60)/4 = 78.75
    expect(result.score).toBeCloseTo(78.75);
    expect(result.appliedWeight).toBe(100);
    expect(result.missing).toEqual([]);
    expect(result.weightsSource).toBe("cycle");
    expect(result.band?.id).toBe("good");
  });

  it("excludes a method with weight but no score, renormalising the rest — never zeroing it", () => {
    const result = computeEmployeeCycleResult({
      employeeId: "emp-1",
      evaluationId: "eval-1",
      orgUnitId: null,
      cycleWeights: EQUAL_WEIGHTS,
      orgUnitWeights: null,
      inputs: {
        activityScores: [100],
        competencyScores: [],
        bauTaskScores: [],
        feedback360Percent: null,
      },
    });
    expect(result.score).toBe(100);
    expect(result.appliedWeight).toBe(25);
    // Order follows `evaluationMethods` (activities, bau, competencies, feedback360).
    expect(result.missing).toEqual(["bau", "competencies", "feedback360"]);
  });

  it("returns a null score, not zero, when nothing is scorable yet", () => {
    const result = computeEmployeeCycleResult({
      employeeId: "emp-1",
      evaluationId: "eval-1",
      orgUnitId: null,
      cycleWeights: EQUAL_WEIGHTS,
      orgUnitWeights: null,
      inputs: { activityScores: [], competencyScores: [], bauTaskScores: [], feedback360Percent: null },
    });
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("prefers the org-unit's own weights over the cycle's default", () => {
    const orgUnitWeights: MethodWeights = { activities: 100, competencies: 0, bau: 0, feedback360: 0 };
    const result = computeEmployeeCycleResult({
      employeeId: "emp-1",
      evaluationId: "eval-1",
      orgUnitId: "unit-1",
      cycleWeights: EQUAL_WEIGHTS,
      orgUnitWeights,
      inputs: {
        activityScores: [55],
        competencyScores: [100],
        bauTaskScores: [100],
        feedback360Percent: 100,
      },
    });
    expect(result.weightsSource).toBe("orgUnit");
    expect(result.score).toBe(55);
  });
});
