import { describe, expect, it } from "vitest";
import {
  financeReviewNotification,
  planTransitionNotification,
  requestTransitionNotification,
} from "./notificationTemplates";
import { planStatuses, requestStatuses } from "./recruitmentWorkflow";

describe("requestTransitionNotification", () => {
  it("produces a distinct, non-empty Arabic message for every request status", () => {
    const messages = requestStatuses.map(
      (status) => requestTransitionNotification({ toStatus: status, jobTitle: "محلل بيانات" }).messageAr
    );
    for (const message of messages) {
      expect(message.trim().length).toBeGreaterThan(0);
      // The subject must always identify WHICH request this is about.
      expect(message).toContain("محلل بيانات");
    }
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("includes the reason on a return and a rejection", () => {
    const returned = requestTransitionNotification({
      toStatus: "returned_for_revision",
      jobTitle: "محلل بيانات",
      reason: "المؤهلات غير واضحة",
    });
    expect(returned.messageAr).toContain("السبب: المؤهلات غير واضحة");

    const rejected = requestTransitionNotification({
      toStatus: "rejected",
      jobTitle: "محلل بيانات",
      reason: "غير مبرر",
    });
    expect(rejected.messageAr).toContain("السبب: غير مبرر");
  });

  it("reads cleanly when no reason was given", () => {
    const message = requestTransitionNotification({
      toStatus: "returned_for_revision",
      jobTitle: "محلل بيانات",
    }).messageAr;
    expect(message).not.toContain("السبب");
    expect(message.endsWith(".")).toBe(true);
  });

  it("treats a whitespace-only reason as no reason", () => {
    const message = requestTransitionNotification({
      toStatus: "rejected",
      jobTitle: "محلل بيانات",
      reason: "   ",
    }).messageAr;
    expect(message).not.toContain("السبب");
  });

  it("truncates a very long reason instead of flooding the bell", () => {
    const message = requestTransitionNotification({
      toStatus: "rejected",
      jobTitle: "محلل بيانات",
      reason: "ط".repeat(500),
    }).messageAr;
    expect(message).toContain("...");
    expect(message.length).toBeLessThan(200);
  });

  it("falls back to the shared status vocabulary for an unknown state", () => {
    const message = requestTransitionNotification({
      toStatus: "some_future_state",
      jobTitle: "محلل بيانات",
    }).messageAr;
    // Not silently dropped, and not a raw English identifier on its own.
    expect(message).toContain("محلل بيانات");
    expect(message).toContain("some_future_state");
  });
});

describe("planTransitionNotification", () => {
  const base = { planName: "خطة 2027", planYear: 2027, planId: "abc" };

  it("produces a distinct, non-empty Arabic message for every plan status", () => {
    const messages = planStatuses.map(
      (status) => planTransitionNotification({ ...base, toStatus: status }).messageAr
    );
    for (const message of messages) {
      expect(message.trim().length).toBeGreaterThan(0);
      expect(message).toContain("2027");
    }
    // 'draft' has no dedicated case and falls through to the generic one, so
    // one duplicate is expected; every other message must be unique.
    expect(new Set(messages).size).toBeGreaterThanOrEqual(messages.length - 1);
  });

  it("matches the spec's own worked example for a finance return", () => {
    const message = planTransitionNotification({
      ...base,
      toStatus: "returned_for_revision",
      reason: "تجاوز سقف الميزانية",
    }).messageAr;
    expect(message).toContain("أُعيدت");
    expect(message).toContain("خطة التوظيف 2027");
    expect(message).toContain("السبب: تجاوز سقف الميزانية");
  });

  it("links every plan notification to that plan, locale-free", () => {
    for (const status of planStatuses) {
      const { linkPath } = planTransitionNotification({ ...base, toStatus: status });
      expect(linkPath).toBe("/recruitment/plan/abc");
      // The bell prefixes the reader's own locale; a hard-coded one here
      // would strand half the users on the wrong language.
      expect(linkPath?.startsWith("/ar")).toBe(false);
      expect(linkPath?.startsWith("/en")).toBe(false);
    }
  });
});

describe("financeReviewNotification", () => {
  const base = { planName: "خطة 2027", planYear: 2027, planId: "abc" };

  it("says plainly when the plan exceeds the approved budget", () => {
    const over = financeReviewNotification({ ...base, overBudget: true }).messageAr;
    expect(over).toContain("تتجاوز الميزانية المعتمدة");

    const under = financeReviewNotification({ ...base, overBudget: false }).messageAr;
    expect(under).not.toContain("تتجاوز");
  });

  it("carries a stable type so the bell can group or filter later", () => {
    expect(financeReviewNotification({ ...base, overBudget: false }).type).toBe(
      "recruitment_plan_finance_reviewed"
    );
  });
});
