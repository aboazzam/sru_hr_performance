import { describe, expect, it } from "vitest";
import {
  DEFAULT_VACANCY_SORT,
  isVacancySortOption,
  sortVacancies,
  VACANCY_SORT_OPTIONS,
  type VacancySortable,
} from "./vacancyTable";

function row(over: Partial<VacancySortable> = {}): VacancySortable {
  return {
    jobTitleName: "محلل بيانات",
    gradeLevel: 9,
    orgUnitName: "إدارة التحول الرقمي",
    status: "open",
    announced: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

const rows = [
  row({ jobTitleName: "محلل بيانات", gradeLevel: 9, createdAt: "2026-08-02T00:00:00.000Z" }),
  row({ jobTitleName: "أخصائي موارد", gradeLevel: 12, createdAt: "2026-08-01T00:00:00.000Z", announced: true }),
  row({ jobTitleName: "سائق", gradeLevel: 2, createdAt: "2026-08-03T00:00:00.000Z" }),
];

describe("sortVacancies", () => {
  it("defaults to newest first", () => {
    expect(sortVacancies(rows, DEFAULT_VACANCY_SORT).map((r) => r.createdAt)).toEqual([
      "2026-08-03T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]);
  });

  it("sorts oldest first", () => {
    expect(sortVacancies(rows, "oldest")[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("sorts by grade in both directions", () => {
    expect(sortVacancies(rows, "gradeDesc").map((r) => r.gradeLevel)).toEqual([12, 9, 2]);
    expect(sortVacancies(rows, "gradeAsc").map((r) => r.gradeLevel)).toEqual([2, 9, 12]);
  });

  it("sorts job titles with Arabic collation", () => {
    const sorted = sortVacancies(rows, "jobTitle").map((r) => r.jobTitleName as string);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, "ar")));
  });

  it("puts advertised postings first, newest first inside each group", () => {
    const mixed = [
      row({ jobTitleName: "أ", announced: false, createdAt: "2026-08-05T00:00:00.000Z" }),
      row({ jobTitleName: "ب", announced: true, createdAt: "2026-08-01T00:00:00.000Z" }),
      row({ jobTitleName: "ج", announced: true, createdAt: "2026-08-04T00:00:00.000Z" }),
    ];
    expect(sortVacancies(mixed, "announcedFirst").map((r) => r.jobTitleName)).toEqual(["ج", "ب", "أ"]);
  });

  it("sorts a missing job title last, not first", () => {
    const withMissing = [row({ jobTitleName: null }), row({ jobTitleName: "محلل بيانات" })];
    expect(sortVacancies(withMissing, "jobTitle").map((r) => r.jobTitleName)).toEqual([
      "محلل بيانات",
      null,
    ]);
  });

  it("sorts a missing grade last in both directions", () => {
    const withMissing = [row({ gradeLevel: null }), row({ gradeLevel: 5 })];
    expect(sortVacancies(withMissing, "gradeAsc").map((r) => r.gradeLevel)).toEqual([5, null]);
    expect(sortVacancies(withMissing, "gradeDesc").map((r) => r.gradeLevel)).toEqual([5, null]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortVacancies(rows, "gradeAsc");
    expect(rows).toEqual(original);
  });
});

describe("isVacancySortOption", () => {
  it("accepts every declared option and rejects anything else", () => {
    for (const option of VACANCY_SORT_OPTIONS) expect(isVacancySortOption(option)).toBe(true);
    expect(isVacancySortOption("nope")).toBe(false);
  });
});
