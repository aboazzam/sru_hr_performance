import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVALUATION_RESULT_SORT,
  EVALUATION_RESULT_SORT_OPTIONS,
  filterEvaluationResults,
  isEvaluationResultSortOption,
  matchesEvaluationResultQuery,
  sortEvaluationResults,
  type EvaluationResultSortable,
} from "./evaluationResultTable";

function row(over: Partial<EvaluationResultSortable> = {}): EvaluationResultSortable {
  return {
    employeeName: "أحمد الغامدي",
    orgUnitName: "إدارة التحول الرقمي",
    score: 80,
    ...over,
  };
}

describe("sortEvaluationResults", () => {
  const rows = [row({ employeeName: "أ", score: 60 }), row({ employeeName: "ب", score: 95 }), row({ employeeName: "ج", score: 78 })];

  it("defaults to highest score first", () => {
    expect(sortEvaluationResults(rows, DEFAULT_EVALUATION_RESULT_SORT).map((r) => r.score)).toEqual([95, 78, 60]);
  });

  it("sorts lowest score first", () => {
    expect(sortEvaluationResults(rows, "scoreAsc").map((r) => r.score)).toEqual([60, 78, 95]);
  });

  it("sorts employee names with Arabic collation", () => {
    const sorted = sortEvaluationResults(rows, "nameAsc").map((r) => r.employeeName as string);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, "ar")));
  });

  it("sorts org units with Arabic collation", () => {
    const mixed = [row({ orgUnitName: "ب" }), row({ orgUnitName: "أ" })];
    expect(sortEvaluationResults(mixed, "orgUnitAsc").map((r) => r.orgUnitName)).toEqual(["أ", "ب"]);
  });

  it("sorts a missing score last in both directions — not treated as zero", () => {
    const withMissing = [row({ score: null }), row({ score: 40 })];
    expect(sortEvaluationResults(withMissing, "scoreDesc").map((r) => r.score)).toEqual([40, null]);
    expect(sortEvaluationResults(withMissing, "scoreAsc").map((r) => r.score)).toEqual([40, null]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortEvaluationResults(rows, "scoreAsc");
    expect(rows).toEqual(original);
  });
});

describe("isEvaluationResultSortOption", () => {
  it("accepts every declared option and rejects anything else", () => {
    for (const option of EVALUATION_RESULT_SORT_OPTIONS) expect(isEvaluationResultSortOption(option)).toBe(true);
    expect(isEvaluationResultSortOption("nope")).toBe(false);
  });
});

describe("matchesEvaluationResultQuery", () => {
  const base = { employeeNumber: "90123", employeeName: "أحمد الغامدي", orgUnitName: "إدارة التحول الرقمي", bandId: "good" as const };

  it("matches an empty query", () => {
    expect(matchesEvaluationResultQuery(base, "  ")).toBe(true);
  });

  it("matches the employee name, number, and org unit", () => {
    expect(matchesEvaluationResultQuery(base, "الغامدي")).toBe(true);
    expect(matchesEvaluationResultQuery(base, "90123")).toBe(true);
    expect(matchesEvaluationResultQuery(base, "التحول")).toBe(true);
  });

  it("ignores hamza differences in names", () => {
    expect(matchesEvaluationResultQuery(base, "احمد")).toBe(true);
  });

  it("tolerates missing fields", () => {
    expect(matchesEvaluationResultQuery({ employeeNumber: null, employeeName: null, orgUnitName: null, bandId: null }, "شيء")).toBe(
      false
    );
  });
});

describe("filterEvaluationResults", () => {
  const rows = [
    { employeeNumber: "1", employeeName: "أحمد الغامدي", orgUnitName: "إدارة التحول الرقمي", bandId: "excellent" as const },
    { employeeNumber: "2", employeeName: "سارة العتيبي", orgUnitName: "إدارة الشؤون المالية", bandId: "good" as const },
  ];

  it("returns everything when nothing is set", () => {
    expect(filterEvaluationResults(rows, {})).toHaveLength(2);
  });

  it("filters by band alone", () => {
    expect(filterEvaluationResults(rows, { bandId: "good" }).map((r) => r.employeeName)).toEqual(["سارة العتيبي"]);
  });

  it("combines band and query", () => {
    expect(filterEvaluationResults(rows, { bandId: "excellent", query: "أحمد" })).toHaveLength(1);
    expect(filterEvaluationResults(rows, { bandId: "good", query: "أحمد" })).toHaveLength(0);
  });
});
