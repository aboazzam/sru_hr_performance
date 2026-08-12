import { describe, expect, it } from "vitest";
import { isPlanOpen, sortPlansForList } from "./recruitmentPlanList";

const plan = (over: Partial<{ plan_year: number; status: string; name_ar: string }> = {}) => ({
  plan_year: 2027,
  status: "draft",
  name_ar: "خطة",
  ...over,
});

describe("isPlanOpen", () => {
  it("treats a finished or rejected plan as closed and everything else as open", () => {
    expect(isPlanOpen("ready_for_execution")).toBe(false);
    expect(isPlanOpen("rejected")).toBe(false);

    // `approved` is deliberately OPEN: it is on its way to execution, so it
    // still has something pending and belongs with the live plans.
    expect(isPlanOpen("approved")).toBe(true);
    for (const status of ["draft", "submitted", "consolidated", "finance_review", "returned_for_revision"]) {
      expect(isPlanOpen(status), status).toBe(true);
    }
  });

  it("treats an unknown value as open rather than hiding it away", () => {
    expect(isPlanOpen("something_new")).toBe(true);
  });
});

describe("sortPlansForList", () => {
  it("puts open plans before closed ones, whatever the year", () => {
    // The case that matters: sorting by year alone — what the list did before
    // — pushes a finished 2028 plan above the 2027 one people are working on.
    const sorted = sortPlansForList([
      plan({ plan_year: 2028, status: "ready_for_execution", name_ar: "منتهية" }),
      plan({ plan_year: 2027, status: "draft", name_ar: "قيد الإعداد" }),
    ]);
    expect(sorted.map((p) => p.name_ar)).toEqual(["قيد الإعداد", "منتهية"]);
  });

  it("orders newest year first within each group", () => {
    const sorted = sortPlansForList([
      plan({ plan_year: 2026, status: "draft", name_ar: "أ" }),
      plan({ plan_year: 2028, status: "draft", name_ar: "ب" }),
      plan({ plan_year: 2027, status: "draft", name_ar: "ج" }),
    ]);
    expect(sorted.map((p) => p.plan_year)).toEqual([2028, 2027, 2026]);
  });

  it("falls back to the name so equal plans keep a stable order", () => {
    const sorted = sortPlansForList([
      plan({ name_ar: "ب" }),
      plan({ name_ar: "أ" }),
    ]);
    expect(sorted.map((p) => p.name_ar)).toEqual(["أ", "ب"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [plan({ plan_year: 2026 }), plan({ plan_year: 2028 })];
    const before = input.map((p) => p.plan_year);
    sortPlansForList(input);
    expect(input.map((p) => p.plan_year)).toEqual(before);
  });
});
