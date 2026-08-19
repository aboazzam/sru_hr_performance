import { describe, expect, it } from "vitest";
import {
  filterPromotions,
  matchesPromotionQuery,
  type PromotionFilterable,
} from "./promotionTable";

function row(over: Partial<PromotionFilterable> = {}): PromotionFilterable {
  return {
    employeeNumber: "90001",
    employeeName: "عبدالله الصالح",
    fromTitleName: "قائد فريق خدمة العملاء",
    toTitleName: "مدير مركز الاتصال",
    status: "pending",
    ...over,
  };
}

describe("matchesPromotionQuery", () => {
  it("matches an empty query", () => {
    expect(matchesPromotionQuery(row(), "   ")).toBe(true);
  });

  it("matches the employee name and both job titles", () => {
    expect(matchesPromotionQuery(row(), "الصالح")).toBe(true);
    expect(matchesPromotionQuery(row(), "خدمة العملاء")).toBe(true);
    expect(matchesPromotionQuery(row(), "مركز الاتصال")).toBe(true);
  });

  it("matches the employee number as a plain substring", () => {
    expect(matchesPromotionQuery(row(), "9000")).toBe(true);
    expect(matchesPromotionQuery(row(), "12345")).toBe(false);
  });

  it("ignores hamza differences in names", () => {
    expect(matchesPromotionQuery(row({ employeeName: "أحمد العتيبي" }), "احمد")).toBe(true);
  });

  it("tolerates missing fields", () => {
    expect(
      matchesPromotionQuery(
        { employeeNumber: null, employeeName: null, fromTitleName: null, toTitleName: null, status: "pending" },
        "شيء"
      )
    ).toBe(false);
  });

  it("rejects a non-matching query", () => {
    expect(matchesPromotionQuery(row(), "زززز")).toBe(false);
  });
});

describe("filterPromotions", () => {
  const rows = [
    row({ employeeName: "عبدالله الصالح", status: "pending" }),
    row({ employeeName: "بدر سالم", status: "approved", employeeNumber: "90002" }),
    row({ employeeName: "باسل عمر", status: "pending", employeeNumber: "90003" }),
  ];

  it("returns everything when nothing is set", () => {
    expect(filterPromotions(rows, {})).toHaveLength(3);
  });

  it("filters by status alone", () => {
    expect(filterPromotions(rows, { status: "pending" }).map((r) => r.employeeName)).toEqual([
      "عبدالله الصالح",
      "باسل عمر",
    ]);
  });

  it("combines status and query", () => {
    expect(filterPromotions(rows, { status: "pending", query: "بدر" })).toHaveLength(0);
    expect(filterPromotions(rows, { status: "approved", query: "بدر" })).toHaveLength(1);
  });
});
