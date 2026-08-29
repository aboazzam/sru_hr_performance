import { describe, expect, it } from "vitest";
import { computeAutoApplyClassificationIds, groupCompetencyFramework, isCompetencyLevelsComplete } from "./competencyFramework";

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
          classification_id: "cls-core",
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
          classification_id: "cls-core",
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

describe("computeAutoApplyClassificationIds", () => {
  it("returns only the ids of classifications flagged auto_apply_everywhere", () => {
    const ids = computeAutoApplyClassificationIds([
      { id: "a", name_ar: "أساسية", name_en: null, auto_apply_everywhere: true },
      { id: "b", name_ar: "تخصصية", name_en: null, auto_apply_everywhere: false },
      { id: "c", name_ar: "مؤسسية", name_en: null, auto_apply_everywhere: false },
    ]);
    expect(ids).toEqual(new Set(["a"]));
  });

  it("is not hardcoded to any particular name -- more than one classification can auto-apply", () => {
    const ids = computeAutoApplyClassificationIds([
      { id: "a", name_ar: "أساسية", name_en: null, auto_apply_everywhere: true },
      { id: "c", name_ar: "مؤسسية", name_en: null, auto_apply_everywhere: true },
    ]);
    expect(ids).toEqual(new Set(["a", "c"]));
  });

  it("returns an empty set when nothing is flagged", () => {
    expect(computeAutoApplyClassificationIds([{ id: "b", name_ar: "تخصصية", name_en: null, auto_apply_everywhere: false }])).toEqual(new Set());
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
