import { describe, expect, it } from "vitest";
import { groupCompetencyFramework, isCompetencyLevelsComplete } from "./competencyFramework";

describe("groupCompetencyFramework", () => {
  it("nests domains under their pillar and competencies under their domain", () => {
    const result = groupCompetencyFramework(
      [{ id: "p1", name_ar: "دعم", name_en: null }],
      [{ id: "d1", pillar_id: "p1", name_ar: "الحوكمة", name_en: null }],
      [
        {
          id: "c1",
          domain_id: "d1",
          name_ar: "الامتثال",
          type: "core",
          definition_ar: "...",
          expected_impact_ar: "...",
          job_family_id: null,
        },
      ],
      [{ competency_id: "c1", level: "basic", behavior_ar: "يلتزم", behavior_en: null }]
    );

    expect(result).toHaveLength(1);
    expect(result[0].domains).toHaveLength(1);
    expect(result[0].domains[0].competencies).toHaveLength(1);
    expect(result[0].domains[0].competencies[0].levels.basic?.behavior_ar).toBe("يلتزم");
    expect(result[0].domains[0].competencies[0].levels.practitioner).toBeUndefined();
  });

  it("gives a pillar/domain with no children an empty array rather than dropping it", () => {
    const result = groupCompetencyFramework(
      [{ id: "p1", name_ar: "دعم", name_en: null }],
      [{ id: "d1", pillar_id: "p1", name_ar: "الحوكمة", name_en: null }],
      [],
      []
    );
    expect(result[0].domains[0].competencies).toEqual([]);
  });

  it("ignores rows referencing an unknown parent instead of throwing", () => {
    const result = groupCompetencyFramework(
      [{ id: "p1", name_ar: "دعم", name_en: null }],
      [{ id: "d1", pillar_id: "p1", name_ar: "الحوكمة", name_en: null }],
      [
        {
          id: "orphan",
          domain_id: "missing-domain",
          name_ar: "x",
          type: "core",
          definition_ar: "",
          expected_impact_ar: "",
          job_family_id: null,
        },
      ],
      []
    );
    expect(result[0].domains[0].competencies).toEqual([]);
  });
});

describe("isCompetencyLevelsComplete", () => {
  it("is true only when all 4 levels have non-blank text", () => {
    const full = {
      basic: { behavior_ar: "a" },
      practitioner: { behavior_ar: "b" },
      advanced: { behavior_ar: "c" },
      professional: { behavior_ar: "d" },
    };
    expect(isCompetencyLevelsComplete(full)).toBe(true);
  });

  it("is false when a level is missing", () => {
    expect(
      isCompetencyLevelsComplete({
        basic: { behavior_ar: "a" },
        practitioner: { behavior_ar: "b" },
        advanced: { behavior_ar: "c" },
      })
    ).toBe(false);
  });

  it("is false when a level's text is only whitespace", () => {
    expect(
      isCompetencyLevelsComplete({
        basic: { behavior_ar: "a" },
        practitioner: { behavior_ar: "b" },
        advanced: { behavior_ar: "c" },
        professional: { behavior_ar: "   " },
      })
    ).toBe(false);
  });
});
