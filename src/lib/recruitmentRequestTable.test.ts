import { describe, expect, it } from "vitest";
import {
  DEFAULT_REQUEST_SORT,
  filterRequests,
  isRequestSortOption,
  matchesRequestQuery,
  REQUEST_SORT_OPTIONS,
  sortRequests,
  type RecruitmentRequestSortable,
} from "./recruitmentRequestTable";

function row(over: Partial<RecruitmentRequestSortable> = {}): RecruitmentRequestSortable {
  return {
    jobTitle: "محلل بيانات",
    orgUnit: "إدارة التحول الرقمي",
    headcount: 1,
    status: "draft",
    qualifications: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

describe("matchesRequestQuery", () => {
  it("matches an empty query", () => {
    expect(matchesRequestQuery(row(), "   ")).toBe(true);
  });

  it("matches the job title and the org unit", () => {
    expect(matchesRequestQuery(row(), "بيانات")).toBe(true);
    expect(matchesRequestQuery(row(), "التحول")).toBe(true);
  });

  it("ignores hamza differences", () => {
    // The stored unit has "إدارة"; the typed query has none.
    expect(matchesRequestQuery(row(), "ادارة")).toBe(true);
  });

  it("matches the qualifications text, which is not a column", () => {
    expect(matchesRequestQuery(row({ qualifications: "بكالوريوس خبرة 5 سنوات" }), "بكالوريوس")).toBe(
      true
    );
  });

  it("matches the status by its Arabic label, not the stored key", () => {
    expect(matchesRequestQuery(row({ status: "under_hr_review" }), "الموارد البشرية")).toBe(true);
    expect(matchesRequestQuery(row({ status: "under_hr_review" }), "under_hr")).toBe(false);
  });

  it("also matches the short form the awaited reader actually sees", () => {
    // HR reads "بانتظار المراجعة" on screen, and that is not a substring of
    // "بانتظار مراجعة الموارد البشرية" — الـ definite article differs — so
    // typing what is in front of them would otherwise find nothing.
    expect(matchesRequestQuery(row({ status: "under_hr_review" }), "بانتظار المراجعة")).toBe(true);
    expect(matchesRequestQuery(row({ status: "draft" }), "بانتظار المراجعة")).toBe(false);
  });

  it("rejects a non-matching query", () => {
    expect(matchesRequestQuery(row(), "زززز")).toBe(false);
  });
});

describe("filterRequests", () => {
  const rows = [
    row({ jobTitle: "محلل بيانات", status: "draft" }),
    row({ jobTitle: "مدير مركز الاتصال", status: "submitted" }),
    row({ jobTitle: "أخصائي موارد بشرية", status: "draft" }),
  ];

  it("returns everything when nothing is set", () => {
    expect(filterRequests(rows, {})).toHaveLength(3);
  });

  it("filters by status alone", () => {
    expect(filterRequests(rows, { status: "draft" }).map((r) => r.jobTitle)).toEqual([
      "محلل بيانات",
      "أخصائي موارد بشرية",
    ]);
  });

  it("combines status and query", () => {
    expect(filterRequests(rows, { status: "draft", query: "محلل" })).toHaveLength(1);
    expect(filterRequests(rows, { status: "submitted", query: "محلل" })).toHaveLength(0);
  });
});

describe("sortRequests", () => {
  const rows = [
    row({ jobTitle: "محلل بيانات", headcount: 3, createdAt: "2026-08-02T00:00:00.000Z", status: "submitted" }),
    row({ jobTitle: "أخصائي موارد", headcount: 7, createdAt: "2026-08-01T00:00:00.000Z", status: "draft" }),
    row({ jobTitle: "سائق", headcount: 1, createdAt: "2026-08-03T00:00:00.000Z", status: "approved" }),
  ];

  it("defaults to newest first", () => {
    expect(sortRequests(rows, DEFAULT_REQUEST_SORT).map((r) => r.createdAt)).toEqual([
      "2026-08-03T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]);
  });

  it("sorts oldest first", () => {
    expect(sortRequests(rows, "oldest")[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("sorts by headcount in both directions", () => {
    expect(sortRequests(rows, "headcountDesc").map((r) => r.headcount)).toEqual([7, 3, 1]);
    expect(sortRequests(rows, "headcountAsc").map((r) => r.headcount)).toEqual([1, 3, 7]);
  });

  it("sorts job titles with Arabic collation", () => {
    const sorted = sortRequests(rows, "jobTitle").map((r) => r.jobTitle);
    expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, "ar")));
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortRequests(rows, "headcountAsc");
    expect(rows).toEqual(original);
  });
});

describe("isRequestSortOption", () => {
  it("accepts every declared option and rejects anything else", () => {
    for (const option of REQUEST_SORT_OPTIONS) expect(isRequestSortOption(option)).toBe(true);
    expect(isRequestSortOption("whatever")).toBe(false);
  });
});
