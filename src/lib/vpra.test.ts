import { describe, it, expect } from "vitest";
import {
  hasVpraAccess,
  vpraLevelLabels,
  processAreas,
  processAreaLabels,
  processAreaSections,
  defaultRoles,
  evaluationStates,
  getEvaluationStatePermission,
  isNextEvaluationState,
  canAdvanceEvaluationState,
  nextEvaluationState,
  transitionEvaluationState,
  evalTypes,
  evalTypeLabels,
  type VpraLevel,
  type EvaluationState,
  type EvaluationActorRole,
  type EvalType,
} from "./vpra";

describe("hasVpraAccess", () => {
  const levels: VpraLevel[] = ["none", "view", "prepare", "recommend", "approve"];

  it("is true when actual equals required", () => {
    for (const level of levels) {
      expect(hasVpraAccess(level, level)).toBe(true);
    }
  });

  it("follows the documented none < view < prepare < recommend < approve order", () => {
    for (let i = 0; i < levels.length; i++) {
      for (let j = 0; j < levels.length; j++) {
        expect(hasVpraAccess(levels[i], levels[j])).toBe(i >= j);
      }
    }
  });
});

describe("static reference lists", () => {
  it("has the 12 process areas from CLAUDE.md section 4 plus orgStructure/staffing/identity (added 2026-07-22 and 2026-07-25)", () => {
    expect(processAreas).toHaveLength(15);
    expect(new Set(processAreas).size).toBe(15);
    expect(processAreas).toContain("orgStructure");
    expect(processAreas).toContain("staffing");
    expect(processAreas).toContain("identity");
    expect(processAreas).not.toContain("reports");
  });

  it("has an Arabic label for every process area", () => {
    for (const area of processAreas) {
      expect(processAreaLabels[area]?.length).toBeGreaterThan(0);
    }
  });

  it("groups every process area into exactly one labeled section", () => {
    const allSectioned = processAreaSections.flatMap((s) => s.areas);
    expect(allSectioned).toHaveLength(processAreas.length);
    expect(new Set(allSectioned).size).toBe(processAreas.length);
    for (const area of processAreas) {
      expect(allSectioned).toContain(area);
    }
    for (const section of processAreaSections) {
      expect(section.titleAr.length).toBeGreaterThan(0);
    }
  });

  it("has exactly the 12 default roles from CLAUDE.md section 4, each with an Arabic label", () => {
    expect(defaultRoles).toHaveLength(12);
    for (const role of defaultRoles) {
      expect(role.nameAr.length).toBeGreaterThan(0);
    }
  });

  it("every VPRA level has an Arabic label", () => {
    const levels: VpraLevel[] = ["none", "view", "prepare", "recommend", "approve"];
    for (const level of levels) {
      expect(vpraLevelLabels[level].length).toBeGreaterThan(0);
    }
  });

  it("has the 7 evaluation states in CLAUDE.md 4-A's documented order", () => {
    expect(evaluationStates).toEqual([
      "draft",
      "submitted",
      "supervisor_reviewed",
      "manager_recommended",
      "committee_reviewed",
      "approved",
      "finalized",
    ]);
  });

  it("has exactly the 4 eval_type perspectives, each with an Arabic label", () => {
    const expected: EvalType[] = ["self", "supervisor", "peer", "customer"];
    expect(evalTypes).toEqual(expected);
    for (const type of evalTypes) {
      expect(evalTypeLabels[type].length).toBeGreaterThan(0);
    }
  });
});

describe("getEvaluationStatePermission — full 4-A table, cell for cell", () => {
  // Transcribed independently from CLAUDE.md section 4-A for cross-checking,
  // not copy-pasted from vpra.ts's own table.
  const expected: Record<EvaluationState, Record<EvaluationActorRole, VpraLevel>> = {
    draft: { employee: "prepare", supervisor: "view", manager: "none", committee: "none", hr_admin: "view", field_supervisor: "view" },
    submitted: { employee: "view", supervisor: "prepare", manager: "view", committee: "none", hr_admin: "view", field_supervisor: "prepare" },
    supervisor_reviewed: { employee: "view", supervisor: "view", manager: "recommend", committee: "none", hr_admin: "view", field_supervisor: "view" },
    manager_recommended: { employee: "view", supervisor: "view", manager: "view", committee: "recommend", hr_admin: "view", field_supervisor: "view" },
    committee_reviewed: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "approve", field_supervisor: "view" },
    approved: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "view", field_supervisor: "view" },
    finalized: { employee: "view", supervisor: "view", manager: "view", committee: "view", hr_admin: "view", field_supervisor: "view" },
  };

  for (const [state, roles] of Object.entries(expected) as [EvaluationState, Record<EvaluationActorRole, VpraLevel>][]) {
    for (const [role, level] of Object.entries(roles) as [EvaluationActorRole, VpraLevel][]) {
      it(`${state}.${role} === "${level}"`, () => {
        expect(getEvaluationStatePermission(state, role)).toBe(level);
      });
    }
  }

  it("field_supervisor mirrors supervisor at every state (2026-07-16 decision, not a CLAUDE.md transcription)", () => {
    for (const state of Object.keys(expected) as EvaluationState[]) {
      expect(getEvaluationStatePermission(state, "field_supervisor")).toBe(
        getEvaluationStatePermission(state, "supervisor")
      );
    }
  });

  it("resolves roles outside the six modeled actors to 'none'", () => {
    expect(getEvaluationStatePermission("draft", "super_admin")).toBe("none");
    expect(getEvaluationStatePermission("committee_reviewed", "mentor")).toBe("none");
  });
});

describe("isNextEvaluationState", () => {
  it("is true only for immediate successors in the linear lifecycle", () => {
    for (let i = 0; i < evaluationStates.length - 1; i++) {
      expect(isNextEvaluationState(evaluationStates[i], evaluationStates[i + 1])).toBe(true);
    }
  });

  it("is false for skips, repeats, and backward moves", () => {
    expect(isNextEvaluationState("draft", "supervisor_reviewed")).toBe(false);
    expect(isNextEvaluationState("draft", "draft")).toBe(false);
    expect(isNextEvaluationState("submitted", "draft")).toBe(false);
  });
});

describe("evaluation state transitions", () => {
  it("exactly one actor role can advance each state except approved and finalized", () => {
    const roles: EvaluationActorRole[] = ["employee", "supervisor", "manager", "committee", "hr_admin"];
    const expectedActor: Partial<Record<EvaluationState, EvaluationActorRole>> = {
      draft: "employee",
      submitted: "supervisor",
      supervisor_reviewed: "manager",
      manager_recommended: "committee",
      committee_reviewed: "hr_admin",
    };

    for (const state of evaluationStates) {
      const actionable = roles.filter((role) => canAdvanceEvaluationState(state, role));
      if (state === "approved" || state === "finalized") {
        expect(actionable).toEqual([]);
      } else {
        expect(actionable).toEqual([expectedActor[state]]);
      }
    }
  });

  it("nextEvaluationState walks the full chain and terminates at finalized", () => {
    let state: EvaluationState | null = "draft";
    const visited: EvaluationState[] = [];
    while (state) {
      visited.push(state);
      state = nextEvaluationState(state);
    }
    expect(visited).toEqual(evaluationStates);
  });

  it("transitionEvaluationState advances state when the actor holds an actionable level", () => {
    expect(transitionEvaluationState("draft", "employee")).toBe("submitted");
    expect(transitionEvaluationState("submitted", "supervisor")).toBe("supervisor_reviewed");
    expect(transitionEvaluationState("supervisor_reviewed", "manager")).toBe("manager_recommended");
    expect(transitionEvaluationState("manager_recommended", "committee")).toBe("committee_reviewed");
    expect(transitionEvaluationState("committee_reviewed", "hr_admin")).toBe("approved");
  });

  it("transitionEvaluationState throws when the actor lacks an actionable level", () => {
    expect(() => transitionEvaluationState("draft", "supervisor")).toThrow();
    expect(() => transitionEvaluationState("draft", "hr_admin")).toThrow();
  });

  it("transitionEvaluationState throws for approved (system-triggered, no actor)", () => {
    expect(() => transitionEvaluationState("approved", "hr_admin")).toThrow();
  });

  it("transitionEvaluationState throws for finalized (terminal state)", () => {
    for (const role of ["employee", "supervisor", "manager", "committee", "hr_admin"] as const) {
      expect(() => transitionEvaluationState("finalized", role)).toThrow();
    }
  });
});
