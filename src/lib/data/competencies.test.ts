import { describe, it, expect } from "vitest";
import {
  competencies,
  pillars,
  getCompetenciesByPillar,
  getCompetencyById,
  behavioralLevelLabels,
  competencyTypeLabels,
  type BehavioralLevel,
} from "./competencies";

describe("competencies data integrity", () => {
  it("has exactly 27 competencies (3 pillars x 3 domains x 3 each)", () => {
    expect(competencies).toHaveLength(27);
  });

  it("has unique ids", () => {
    const ids = competencies.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every competency belongs to one of the 3 documented pillars", () => {
    for (const c of competencies) {
      expect(pillars).toContain(c.pillar);
    }
  });

  it("every pillar has exactly 3 domains with exactly 3 competencies each", () => {
    for (const pillar of pillars) {
      const items = getCompetenciesByPillar(pillar);
      expect(items).toHaveLength(9);
      const domains = [...new Set(items.map((c) => c.domain))];
      expect(domains).toHaveLength(3);
      for (const domain of domains) {
        expect(items.filter((c) => c.domain === domain)).toHaveLength(3);
      }
    }
  });

  it("every competency has a non-empty definition and expected impact", () => {
    for (const c of competencies) {
      expect(c.definition.length).toBeGreaterThan(0);
      expect(c.expectedImpact.length).toBeGreaterThan(0);
    }
  });

  it("every competency has all 4 behavioral levels populated with at least one indicator", () => {
    const levels: BehavioralLevel[] = ["basic", "practitioner", "advanced", "professional"];
    for (const c of competencies) {
      for (const level of levels) {
        expect(c.levels[level].length).toBeGreaterThan(0);
      }
    }
  });

  it("every competency has a valid type with a label", () => {
    for (const c of competencies) {
      expect(competencyTypeLabels[c.type]).toBeDefined();
    }
  });

  it("behavioralLevelLabels uses the officially corrected names (not CLAUDE.md's original typo)", () => {
    expect(behavioralLevelLabels.basic).toBe("أساسي");
    expect(behavioralLevelLabels.practitioner).toBe("ممارس");
    expect(behavioralLevelLabels.advanced).toBe("متقدم");
    expect(behavioralLevelLabels.professional).toBe("محترف");
  });

  it("getCompetencyById finds a known competency and returns undefined for an unknown id", () => {
    expect(getCompetencyById("support.governance.1")?.name).toBe("الامتثال والالتزام");
    expect(getCompetencyById("nonexistent.id")).toBeUndefined();
  });
});
