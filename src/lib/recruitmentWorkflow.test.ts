import { describe, expect, it } from "vitest";
import {
  availablePlanTransitions,
  availableRequestTransitions,
  evaluatePlanTransition,
  evaluateRequestTransition,
  isRequestDecided,
  planStatusLabel,
  planStatuses,
  planTransitions,
  requestStatusLabel,
  requestStatusLabels,
  requestStatuses,
  requestTransitions,
  transitionRefusalMessages,
  type RecruitmentPermissions,
} from "./recruitmentWorkflow";

// The four actors, expressed exactly as /admin would grant them.
const sectionHead: RecruitmentPermissions = { recruitmentPlan: "prepare" };
const hr: RecruitmentPermissions = { recruitmentPlan: "recommend" };
const finance: RecruitmentPermissions = { recruitmentBudget: "recommend" };
const authority: RecruitmentPermissions = { recruitmentPlan: "approve" };
const nobody: RecruitmentPermissions = {};
/** Deliberately over-privileged, used to isolate non-permission refusals. */
const superuser: RecruitmentPermissions = {
  recruitmentPlan: "approve",
  recruitmentBudget: "approve",
};

const satisfied = {
  permissions: superuser,
  note: "سبب",
  financeNote: "ملاحظة مالية",
  financeReviewed: true,
  undecidedRequestCount: 0,
};

describe("status vocabularies", () => {
  // These arrays must mirror the CHECK constraints in migration
  // 20260807000002 exactly; drift between them breaks every write.
  it("matches the request status CHECK in the migration", () => {
    expect([...requestStatuses]).toEqual([
      "draft",
      "submitted",
      "under_hr_review",
      "included_in_plan",
      "returned_for_revision",
      "approved",
      "rejected",
    ]);
  });

  it("matches the plan status CHECK in the migration", () => {
    expect([...planStatuses]).toEqual([
      "draft",
      "submitted",
      "consolidated",
      "finance_review",
      "returned_for_revision",
      "approved",
      "ready_for_execution",
      "rejected",
    ]);
  });

  it("labels every status in Arabic and passes unknown values through untouched", () => {
    for (const status of requestStatuses) expect(requestStatusLabel(status)).not.toBe(status);
    for (const status of planStatuses) expect(planStatusLabel(status)).not.toBe(status);
    expect(requestStatusLabel("something_else")).toBe("something_else");
    expect(planStatusLabel("something_else")).toBe("something_else");
  });

  it("treats only submitted/under_hr_review as undecided", () => {
    expect(isRequestDecided("submitted")).toBe(false);
    expect(isRequestDecided("under_hr_review")).toBe(false);
    expect(isRequestDecided("included_in_plan")).toBe(true);
    expect(isRequestDecided("rejected")).toBe(true);
    expect(isRequestDecided("draft")).toBe(true);
  });

  it("has an Arabic message for every refusal reason", () => {
    for (const message of Object.values(transitionRefusalMessages)) {
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("every DEFINED transition passes when its preconditions are met", () => {
  it.each(requestTransitions.map((rule) => [rule.from, rule.to] as const))(
    "request %s -> %s",
    (from, to) => {
      const verdict = evaluateRequestTransition(from, to, satisfied);
      expect(verdict.allowed).toBe(true);
    }
  );

  it.each(planTransitions.map((rule) => [rule.from, rule.to] as const))(
    "plan %s -> %s",
    (from, to) => {
      const verdict = evaluatePlanTransition(from, to, satisfied);
      expect(verdict.allowed).toBe(true);
    }
  );
});

describe("every UNDEFINED transition is refused, even with full permissions", () => {
  it("refuses all request pairs that are not in the table", () => {
    const defined = new Set(requestTransitions.map((rule) => `${rule.from}->${rule.to}`));
    let checked = 0;
    for (const from of requestStatuses) {
      for (const to of requestStatuses) {
        if (defined.has(`${from}->${to}`)) continue;
        checked += 1;
        const verdict = evaluateRequestTransition(from, to, satisfied);
        expect(verdict).toEqual({ allowed: false, refusal: "unknown_transition" });
      }
    }
    // 7 statuses -> 49 pairs, minus the 10 defined ones.
    expect(checked).toBe(requestStatuses.length ** 2 - requestTransitions.length);
  });

  it("refuses all plan pairs that are not in the table", () => {
    const defined = new Set(planTransitions.map((rule) => `${rule.from}->${rule.to}`));
    let checked = 0;
    for (const from of planStatuses) {
      for (const to of planStatuses) {
        if (defined.has(`${from}->${to}`)) continue;
        checked += 1;
        const verdict = evaluatePlanTransition(from, to, satisfied);
        expect(verdict).toEqual({ allowed: false, refusal: "unknown_transition" });
      }
    }
    expect(checked).toBe(planStatuses.length ** 2 - planTransitions.length);
  });

  it("refuses a status that does not exist at all", () => {
    expect(evaluatePlanTransition("draft", "teleported", satisfied)).toEqual({
      allowed: false,
      refusal: "unknown_transition",
    });
  });
});

describe("every DEFINED transition is refused for a caller with no permissions", () => {
  it.each(requestTransitions.map((rule) => [rule.from, rule.to] as const))(
    "request %s -> %s",
    (from, to) => {
      expect(evaluateRequestTransition(from, to, { ...satisfied, permissions: nobody })).toEqual({
        allowed: false,
        refusal: "forbidden",
      });
    }
  );

  it.each(planTransitions.map((rule) => [rule.from, rule.to] as const))(
    "plan %s -> %s",
    (from, to) => {
      expect(evaluatePlanTransition(from, to, { ...satisfied, permissions: nobody })).toEqual({
        allowed: false,
        refusal: "forbidden",
      });
    }
  );
});

describe("the four actors are separated by VPRA level, not by role identity", () => {
  it("lets a section head submit its own request but not review it", () => {
    expect(evaluateRequestTransition("draft", "submitted", { permissions: sectionHead }).allowed).toBe(true);
    expect(
      evaluateRequestTransition("submitted", "under_hr_review", { permissions: sectionHead })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });

  it("lets HR review and consolidate, but not give final approval", () => {
    expect(evaluateRequestTransition("submitted", "under_hr_review", { permissions: hr }).allowed).toBe(true);
    expect(evaluateRequestTransition("under_hr_review", "included_in_plan", { permissions: hr }).allowed).toBe(true);
    expect(
      evaluatePlanTransition("finance_review", "approved", {
        permissions: hr,
        financeReviewed: true,
        undecidedRequestCount: 0,
      })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });

  it("lets HR raise a request too, since recommend outranks prepare", () => {
    expect(evaluateRequestTransition("draft", "submitted", { permissions: hr }).allowed).toBe(true);
  });

  it("lets finance review the budget without any recruitmentPlan grant at all", () => {
    expect(evaluatePlanTransition("submitted", "finance_review", { permissions: finance }).allowed).toBe(true);
    expect(finance.recruitmentPlan).toBeUndefined();
  });

  it("does not let finance approve the plan", () => {
    expect(
      evaluatePlanTransition("finance_review", "approved", {
        permissions: finance,
        financeReviewed: true,
        undecidedRequestCount: 0,
      })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });

  it("does not let the approval authority perform the finance review", () => {
    expect(
      evaluatePlanTransition("finance_review", "returned_for_revision", {
        permissions: authority,
        note: "سبب",
        financeNote: "ملاحظة",
      })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });
});

describe("mandatory reasons", () => {
  it("requires a reason on every return-for-revision and rejection", () => {
    const returnsAndRejections = [
      ...requestTransitions.filter((r) => r.to === "returned_for_revision" || r.to === "rejected"),
      ...planTransitions.filter((r) => r.to === "returned_for_revision" || r.to === "rejected"),
    ];
    expect(returnsAndRejections.length).toBeGreaterThan(0);
    for (const rule of returnsAndRejections) {
      expect(rule.requiresNote).toBe(true);
    }
  });

  it("refuses a blank or whitespace-only reason", () => {
    for (const note of [undefined, null, "", "   ", "\n\t"]) {
      expect(
        evaluateRequestTransition("under_hr_review", "rejected", { permissions: superuser, note })
      ).toEqual({ allowed: false, refusal: "note_required" });
    }
    expect(
      evaluateRequestTransition("under_hr_review", "rejected", {
        permissions: superuser,
        note: "الاحتياج غير مبرر",
      }).allowed
    ).toBe(true);
  });

  it("requires a finance note on every finance action (spec §4)", () => {
    expect(
      evaluatePlanTransition("finance_review", "returned_for_revision", {
        permissions: superuser,
        note: "تجاوز سقف الميزانية",
        financeNote: "   ",
      })
    ).toEqual({ allowed: false, refusal: "finance_note_required" });

    expect(
      evaluatePlanTransition("finance_review", "returned_for_revision", {
        permissions: superuser,
        note: "تجاوز سقف الميزانية",
        financeNote: "الميزانية المعتمدة أقل من الإجمالي",
      }).allowed
    ).toBe(true);
  });
});

describe("final approval preconditions", () => {
  const base = { permissions: superuser, financeReviewed: true, undecidedRequestCount: 0 };

  it("blocks approval while any request is still undecided", () => {
    expect(evaluatePlanTransition("finance_review", "approved", { ...base, undecidedRequestCount: 1 })).toEqual({
      allowed: false,
      refusal: "undecided_requests",
    });
  });

  it("blocks approval before finance has reviewed", () => {
    expect(evaluatePlanTransition("finance_review", "approved", { ...base, financeReviewed: false })).toEqual({
      allowed: false,
      refusal: "finance_review_required",
    });
  });

  it("treats a missing undecided count as zero, not as unknown", () => {
    expect(
      evaluatePlanTransition("finance_review", "approved", {
        permissions: superuser,
        financeReviewed: true,
      }).allowed
    ).toBe(true);
  });

  it("allows approval once both preconditions hold", () => {
    expect(evaluatePlanTransition("finance_review", "approved", base).allowed).toBe(true);
  });

  it("has no path from draft straight to approved", () => {
    expect(evaluatePlanTransition("draft", "approved", satisfied)).toEqual({
      allowed: false,
      refusal: "unknown_transition",
    });
  });

  it("only reaches ready_for_execution from approved", () => {
    const intoExecution = planTransitions.filter((r) => r.to === "ready_for_execution");
    expect(intoExecution).toHaveLength(1);
    expect(intoExecution[0].from).toBe("approved");
  });
});

describe("the documented happy path is walkable end to end", () => {
  it("walks request: draft -> submitted -> under_hr_review -> included_in_plan -> approved", () => {
    const steps: Array<[string, string, RecruitmentPermissions]> = [
      ["draft", "submitted", sectionHead],
      ["submitted", "under_hr_review", hr],
      ["under_hr_review", "included_in_plan", hr],
      ["included_in_plan", "approved", authority],
    ];
    for (const [from, to, permissions] of steps) {
      expect(evaluateRequestTransition(from, to, { permissions }).allowed).toBe(true);
    }
  });

  it("walks plan: draft -> consolidated -> submitted -> finance_review -> approved -> ready_for_execution", () => {
    expect(evaluatePlanTransition("draft", "consolidated", { permissions: hr }).allowed).toBe(true);
    expect(evaluatePlanTransition("consolidated", "submitted", { permissions: hr }).allowed).toBe(true);
    expect(evaluatePlanTransition("submitted", "finance_review", { permissions: finance }).allowed).toBe(true);
    expect(
      evaluatePlanTransition("finance_review", "approved", {
        permissions: authority,
        financeReviewed: true,
        undecidedRequestCount: 0,
      }).allowed
    ).toBe(true);
    expect(evaluatePlanTransition("approved", "ready_for_execution", { permissions: authority }).allowed).toBe(true);
  });

  it("walks the return-for-revision detour and back", () => {
    expect(
      evaluatePlanTransition("finance_review", "returned_for_revision", {
        permissions: finance,
        note: "تجاوز سقف الميزانية",
        financeNote: "تجاوز سقف الميزانية",
      }).allowed
    ).toBe(true);
    expect(evaluatePlanTransition("returned_for_revision", "draft", { permissions: hr }).allowed).toBe(true);

    expect(
      evaluateRequestTransition("under_hr_review", "returned_for_revision", {
        permissions: hr,
        note: "المؤهلات غير واضحة",
      }).allowed
    ).toBe(true);
    expect(evaluateRequestTransition("returned_for_revision", "submitted", { permissions: sectionHead }).allowed).toBe(true);
  });
});

describe("available* drives the action buttons", () => {
  it("offers a section head only its own submit action", () => {
    expect(availableRequestTransitions("draft", sectionHead).map((r) => r.to)).toEqual(["submitted"]);
  });

  it("offers HR the three item-level outcomes while reviewing", () => {
    expect(new Set(availableRequestTransitions("under_hr_review", hr).map((r) => r.to))).toEqual(
      new Set(["included_in_plan", "rejected", "returned_for_revision"])
    );
  });

  it("offers nothing at all to a caller with no grants", () => {
    for (const status of requestStatuses) {
      expect(availableRequestTransitions(status, nobody)).toEqual([]);
    }
    for (const status of planStatuses) {
      expect(availablePlanTransitions(status, nobody)).toEqual([]);
    }
  });

  it("offers finance its review actions but never the approval", () => {
    const tos = availablePlanTransitions("finance_review", finance).map((r) => r.to);
    expect(tos).toContain("returned_for_revision");
    expect(tos).not.toContain("approved");
  });

  it("still offers a button whose form preconditions are unmet, so the caller can fill them", () => {
    // Permission is held, the note simply has not been typed yet — hiding the
    // button here would leave no way to discover what is missing.
    expect(availableRequestTransitions("under_hr_review", hr).map((r) => r.to)).toContain("rejected");
    expect(
      evaluateRequestTransition("under_hr_review", "rejected", { permissions: hr })
    ).toEqual({ allowed: false, refusal: "note_required" });
  });

  it("gives every rule an Arabic action label", () => {
    for (const rule of [...requestTransitions, ...planTransitions]) {
      expect(rule.labelAr.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("status-adjacent transitions (2026-08-08)", () => {
  it("marks exactly one request transition to render beside the status", () => {
    const adjacent = requestTransitions.filter((rule) => rule.statusAdjacent);
    expect(adjacent).toHaveLength(1);
    expect(adjacent[0]).toMatchObject({
      from: "included_in_plan",
      to: "under_hr_review",
      labelAr: "إخراج من الخطة",
    });
  });

  it("keeps every other request transition in the actions column", () => {
    for (const rule of requestTransitions) {
      if (rule.from === "included_in_plan" && rule.to === "under_hr_review") continue;
      expect(rule.statusAdjacent).toBeUndefined();
    }
  });

  it("reads `included_in_plan` as awaiting approval, not as a final state", () => {
    // The row is in the plan but the plan is not approved yet — the label has
    // to say that, which is what the project owner asked for.
    expect(requestStatusLabels.included_in_plan).toBe("بانتظار الاعتماد");
    expect(requestStatusLabels.approved).toBe("معتمد");
  });
});
