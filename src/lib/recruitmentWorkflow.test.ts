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

/** Every precondition any rule can ask for, including authorship. */
const satisfied = {
  permissions: superuser,
  note: "سبب",
  financeNote: "ملاحظة مالية",
  financeReviewed: true,
  undecidedRequestCount: 0,
  isOwnRequest: true,
};

describe("status vocabularies", () => {
  // These arrays must mirror the CHECK constraints in migration
  // 20260807000002 exactly; drift between them breaks every write.
  it("matches the request status CHECK in the migration", () => {
    expect([...requestStatuses]).toEqual([
      "draft",
      "under_hr_review",
      "hr_reviewed",
      "returned_for_revision",
      "approved",
      "rejected",
      // مهجورتان (20260808000003): لا يُنتجهما شيء وتبقيان لصفوف قديمة.
      "submitted",
      "included_in_plan",
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

  it("counts a request as undecided until the approver rules on it", () => {
    // `hr_reviewed` is the case that matters: HR is done, but the approver
    // has not ruled, so the plan must not be approvable over it.
    expect(isRequestDecided("hr_reviewed")).toBe(false);
    expect(isRequestDecided("under_hr_review")).toBe(false);
    expect(isRequestDecided("submitted")).toBe(false);
    expect(isRequestDecided("approved")).toBe(true);
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
    // 8 statuses (6 live + 2 deprecated) -> 64 pairs, minus the defined ones.
    // Nothing may leave a deprecated status either: they exist only so an old
    // row still satisfies the CHECK, not as a way back into the workflow.
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
    expect(
      evaluateRequestTransition("draft", "under_hr_review", {
        permissions: sectionHead,
        isOwnRequest: true,
      }).allowed
    ).toBe(true);
    expect(
      evaluateRequestTransition("under_hr_review", "hr_reviewed", { permissions: sectionHead })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });

  it("lets HR mark a request reviewed, but not give final approval", () => {
    expect(evaluateRequestTransition("under_hr_review", "hr_reviewed", { permissions: hr }).allowed).toBe(true);
    expect(
      evaluateRequestTransition("hr_reviewed", "approved", { permissions: hr })
    ).toEqual({ allowed: false, refusal: "forbidden" });
    expect(
      evaluatePlanTransition("finance_review", "approved", {
        permissions: hr,
        financeReviewed: true,
        undecidedRequestCount: 0,
      })
    ).toEqual({ allowed: false, refusal: "forbidden" });
  });

  it("lets HR raise a request too, since recommend outranks prepare", () => {
    expect(
      evaluateRequestTransition("draft", "under_hr_review", { permissions: hr, isOwnRequest: true })
        .allowed
    ).toBe(true);
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

  it("keeps a merged-but-unruled request blocking the plan", () => {
    // `hr_reviewed` is what a request sits at after HR merges it into a plan
    // but before the approver rules on it. It MUST count as undecided, or a
    // plan could be approved carrying an item nobody decided — the spec's own
    // rule. This is also why `transitionRecruitmentPlan`'s carry-over only
    // has to sweep up the retired `included_in_plan` rows.
    expect(isRequestDecided("hr_reviewed")).toBe(false);
    expect(isRequestDecided("included_in_plan")).toBe(true);
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
  it("walks request: draft -> under_hr_review -> hr_reviewed -> approved", () => {
    const steps: Array<[string, string, RecruitmentPermissions]> = [
      ["draft", "under_hr_review", sectionHead],
      ["under_hr_review", "hr_reviewed", hr],
      ["hr_reviewed", "approved", authority],
    ];
    for (const [from, to, permissions] of steps) {
      expect(evaluateRequestTransition(from, to, { permissions, isOwnRequest: true }).allowed).toBe(true);
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
    expect(
      evaluateRequestTransition("returned_for_revision", "under_hr_review", {
        permissions: sectionHead,
        isOwnRequest: true,
      }).allowed
    ).toBe(true);
  });
});

describe("available* drives the action buttons", () => {
  it("offers a section head only its own submit action", () => {
    expect(availableRequestTransitions("draft", sectionHead, true).map((r) => r.to)).toEqual([
      "under_hr_review",
    ]);
  });

  it("offers HR the three item-level outcomes while reviewing", () => {
    expect(new Set(availableRequestTransitions("under_hr_review", hr).map((r) => r.to))).toEqual(
      new Set(["hr_reviewed", "rejected", "returned_for_revision"])
    );
  });

  it("offers the approver the three outcomes once HR is done, and HR none of them", () => {
    // The approver clears `recommend` too, so the undo is offered to them as
    // well — VPRA is a ladder, not a set of disjoint slots. What matters is
    // that HR gets ONLY the undo and none of the three decisions.
    const forApprover = availableRequestTransitions("hr_reviewed", authority).map((r) => r.to);
    expect(new Set(forApprover)).toEqual(
      new Set(["approved", "rejected", "returned_for_revision", "under_hr_review"])
    );
    // HR keeps only the undo, which renders beside the status, not as an action.
    expect(availableRequestTransitions("hr_reviewed", hr).map((r) => r.to)).toEqual([
      "under_hr_review",
    ]);
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
      from: "hr_reviewed",
      to: "under_hr_review",
      labelAr: "التراجع عن المراجعة",
    });
  });

  it("keeps every other request transition in the actions column", () => {
    for (const rule of requestTransitions) {
      if (rule.from === "hr_reviewed" && rule.to === "under_hr_review") continue;
      expect(rule.statusAdjacent).toBeUndefined();
    }
  });

  it("lets only the author raise their own request, whatever the level", () => {
    // Reported live twice: HR and the approver both clear `prepare`, so both
    // were offered "رفع الطلب" on somebody else's draft and read it as their
    // own next step. Authority is not the question here — authorship is.
    for (const actor of [sectionHead, hr, authority]) {
      expect(
        evaluateRequestTransition("draft", "under_hr_review", {
          permissions: actor,
          isOwnRequest: true,
        }).allowed
      ).toBe(true);
      expect(
        evaluateRequestTransition("draft", "under_hr_review", {
          permissions: actor,
          isOwnRequest: false,
        })
      ).toEqual({ allowed: false, refusal: "forbidden" });
    }

    // Omitting ownership must refuse, not assume — the safe direction.
    expect(
      evaluateRequestTransition("draft", "under_hr_review", { permissions: sectionHead })
    ).toEqual({ allowed: false, refusal: "forbidden" });

    // Re-raising a returned request is the author's too.
    expect(
      evaluateRequestTransition("returned_for_revision", "under_hr_review", {
        permissions: hr,
        isOwnRequest: false,
      })
    ).toEqual({ allowed: false, refusal: "forbidden" });

    // But reviewing and deciding are NOT owner-gated: HR reviews requests
    // raised by other people, which is the entire point.
    expect(
      evaluateRequestTransition("under_hr_review", "hr_reviewed", {
        permissions: hr,
        isOwnRequest: false,
      }).allowed
    ).toBe(true);
    expect(
      evaluateRequestTransition("hr_reviewed", "approved", {
        permissions: authority,
        isOwnRequest: false,
      }).allowed
    ).toBe(true);
  });

  it("offers no raise button on someone else's draft", () => {
    expect(availableRequestTransitions("draft", hr, false)).toEqual([]);
    expect(availableRequestTransitions("draft", authority, false)).toEqual([]);
    expect(availableRequestTransitions("draft", sectionHead, true).map((r) => r.to)).toEqual([
      "under_hr_review",
    ]);
  });

  it("names each status after WHO the request is waiting on", () => {
    // Reported live: "مراجعة الموارد البشرية" and "تمت المراجعة" describe what
    // just finished, so a reader cannot tell whether the request is theirs to
    // act on. Each live label now names who is being waited for.
    expect(requestStatusLabels.draft).toBe("مسودة");
    expect(requestStatusLabels.under_hr_review).toBe("بانتظار مراجعة الموارد البشرية");
    expect(requestStatusLabels.hr_reviewed).toBe("بانتظار الاعتماد");
    expect(requestStatusLabels.approved).toBe("معتمد");

    // Every live status reads as a state, never as an instruction: an action
    // label leaking in here is what made HR and the approver both read
    // "رفع الطلب" as their own next step.
    for (const status of requestStatuses) {
      if (status === "submitted" || status === "included_in_plan") continue;
      expect(requestStatusLabels[status]).not.toBe("رفع الطلب");
    }
  });
});
