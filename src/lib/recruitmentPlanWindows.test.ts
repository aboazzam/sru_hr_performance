import { describe, expect, it } from "vitest";
import {
  describeDateRange,
  findIntakePlan,
  intakeWindowState,
  isRaisedOutOfPlan,
  planAcceptsRequests,
  planPeriodState,
} from "./recruitmentPlanWindows";

const plan = (over: Partial<Parameters<typeof planAcceptsRequests>[0]> = {}) => ({
  id: "p1",
  status: "draft",
  requests_open_at: null as string | null,
  requests_close_at: null as string | null,
  ...over,
});

describe("intakeWindowState", () => {
  it("treats an unset window as not configured", () => {
    expect(intakeWindowState(null, null, "2026-08-28")).toBe("not_configured");
  });

  it("is open on the opening day and on the closing day (both ends inclusive)", () => {
    expect(intakeWindowState("2026-08-01", "2026-08-31", "2026-08-01")).toBe("open");
    expect(intakeWindowState("2026-08-01", "2026-08-31", "2026-08-31")).toBe("open");
  });

  it("separates before from closed", () => {
    expect(intakeWindowState("2026-08-01", "2026-08-31", "2026-07-31")).toBe("before");
    expect(intakeWindowState("2026-08-01", "2026-08-31", "2026-09-01")).toBe("closed");
  });

  it("leaves the missing end of a half-set window open", () => {
    expect(intakeWindowState("2026-08-01", null, "2030-01-01")).toBe("open");
    expect(intakeWindowState(null, "2026-08-31", "2020-01-01")).toBe("open");
    expect(intakeWindowState(null, "2026-08-31", "2026-09-01")).toBe("closed");
  });

  it("compares as strings, so a year boundary is not a lexical trap", () => {
    expect(intakeWindowState("2026-12-01", "2027-01-15", "2026-12-31")).toBe("open");
    expect(intakeWindowState("2026-12-01", "2027-01-15", "2027-01-16")).toBe("closed");
  });
});

describe("planPeriodState", () => {
  it("mirrors the evaluation-cycle reading, both ends inclusive", () => {
    expect(planPeriodState(null, null, "2026-08-28")).toBe("not_configured");
    expect(planPeriodState("2027-01-01", "2027-12-31", "2026-08-28")).toBe("upcoming");
    expect(planPeriodState("2027-01-01", "2027-12-31", "2027-01-01")).toBe("active");
    expect(planPeriodState("2027-01-01", "2027-12-31", "2027-12-31")).toBe("active");
    expect(planPeriodState("2027-01-01", "2027-12-31", "2028-01-01")).toBe("ended");
  });
});

describe("planAcceptsRequests", () => {
  it("accepts when no window is configured — the behaviour before this feature", () => {
    expect(planAcceptsRequests(plan(), "2026-08-28")).toBe(true);
  });

  it("refuses once the intake window has closed", () => {
    expect(
      planAcceptsRequests(plan({ requests_open_at: "2026-01-01", requests_close_at: "2026-06-30" }), "2026-08-28")
    ).toBe(false);
  });

  it("refuses an approved plan even inside its own window", () => {
    // هذا هو نصّ الطلب حرفيًا: «الاحتياج بعد اقرار الخطة».
    expect(
      planAcceptsRequests(
        plan({ status: "approved", requests_open_at: "2026-01-01", requests_close_at: "2026-12-31" }),
        "2026-08-28"
      )
    ).toBe(false);
  });

  it("refuses a rejected or already-executing plan", () => {
    expect(planAcceptsRequests(plan({ status: "rejected" }), "2026-08-28")).toBe(false);
    expect(planAcceptsRequests(plan({ status: "ready_for_execution" }), "2026-08-28")).toBe(false);
  });

  it("still accepts a plan that is merely under review", () => {
    expect(planAcceptsRequests(plan({ status: "finance_review" }), "2026-08-28")).toBe(true);
  });
});

describe("findIntakePlan", () => {
  it("returns null when nothing is open", () => {
    const plans = [plan({ id: "old", requests_open_at: "2025-01-01", requests_close_at: "2025-06-30" })];
    expect(findIntakePlan(plans, "2026-08-28")).toBeNull();
  });

  it("prefers a plan with a real window over one left wide open", () => {
    // خطةٌ قديمة بلا نافذة يجب ألّا تبتلع طلبات خطةٍ فُتحت لها نافذة صريحة.
    const plans = [
      plan({ id: "legacy" }),
      plan({ id: "current", requests_open_at: "2026-08-01", requests_close_at: "2026-09-30" }),
    ];
    expect(findIntakePlan(plans, "2026-08-28")?.id).toBe("current");
  });

  it("takes the later-opening window when two genuinely overlap", () => {
    const plans = [
      plan({ id: "a", requests_open_at: "2026-01-01", requests_close_at: "2026-12-31" }),
      plan({ id: "b", requests_open_at: "2026-08-01", requests_close_at: "2026-09-30" }),
    ];
    expect(findIntakePlan(plans, "2026-08-28")?.id).toBe("b");
  });
});

describe("isRaisedOutOfPlan", () => {
  it("is false while some plan is accepting — the request lands in the plan", () => {
    expect(isRaisedOutOfPlan([plan({ requests_open_at: "2026-08-01", requests_close_at: "2026-09-30" })], "2026-08-28")).toBe(false);
  });

  it("is true once every plan has closed or been approved", () => {
    const plans = [
      plan({ id: "a", status: "approved" }),
      plan({ id: "b", requests_open_at: "2026-01-01", requests_close_at: "2026-06-30" }),
    ];
    expect(isRaisedOutOfPlan(plans, "2026-08-28")).toBe(true);
  });

  it("is true when no plan exists at all", () => {
    expect(isRaisedOutOfPlan([], "2026-08-28")).toBe(true);
  });
});

describe("describeDateRange", () => {
  const id = (iso: string) => iso;

  it("returns null only when neither end is set", () => {
    expect(describeDateRange(null, null, id)).toBeNull();
  });

  it("names which end is missing rather than printing a bare dash", () => {
    expect(describeDateRange("2026-08-01", null, id)).toBe("من 2026-08-01");
    expect(describeDateRange(null, "2026-09-30", id)).toBe("حتى 2026-09-30");
    expect(describeDateRange("2026-08-01", "2026-09-30", id)).toBe("2026-08-01 — 2026-09-30");
  });
});
