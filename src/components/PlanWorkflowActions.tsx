"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  availablePlanTransitions,
  transitionRefusalMessages,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  transitionRecruitmentPlan,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

/**
 * The plan's own workflow buttons, generated from the transition table — the
 * same design as RecruitmentRequestActions, so a rule added in
 * `recruitmentWorkflow.ts` appears here with no change to this file.
 *
 * Only transitions the caller may perform are rendered. Ones whose form
 * preconditions are unmet (a reason not yet typed) still render, since the
 * caller can satisfy them; ones whose STATE preconditions are unmet (finance
 * has not reviewed, requests still undecided) also render, and the server
 * returns the specific Arabic reason — hiding them would leave an approver
 * staring at a plan with no explanation of why it cannot advance.
 */
export function PlanWorkflowActions({
  planId,
  status,
  permissions,
}: {
  planId: string;
  status: string;
  permissions: RecruitmentPermissions;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const options = availablePlanTransitions(status, permissions);
  if (options.length === 0) return null;

  // The approval note is optional; every other note box is mandatory.
  const openRule = options.find((rule) => rule.to === openTarget);
  const noteIsOptional = openRule?.optionalNote === true && openRule.requiresNote !== true;

  function run(toStatus: string, reason?: string) {
    // Send the reason as the finance note ONLY for a finance-side action.
    // Sending it on every transition would let an approval note overwrite
    // the finance note recorded earlier in the cycle — two different facts
    // in two different columns, by different people.
    const rule = options.find((candidate) => candidate.to === toStatus);
    const financeNote = rule?.requiresFinanceNote ? reason : undefined;

    startTransition(async () => {
      const result = await transitionRecruitmentPlan({ planId, toStatus, note: reason, financeNote });
      setState(result);
      if (result.status === "success") {
        setOpenTarget(null);
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((rule) => (
          <button
            key={rule.to}
            type="button"
            className="sru-btn"
            disabled={pending}
            onClick={() => {
              setState(null);
              if (rule.requiresNote || rule.optionalNote) {
                setOpenTarget(openTarget === rule.to ? null : rule.to);
                setNote("");
              } else {
                run(rule.to);
              }
            }}
          >
            {rule.labelAr}
          </button>
        ))}
      </div>

      {openTarget && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 460 }}>
          <textarea
            rows={2}
            value={note}
            placeholder={noteIsOptional ? t("optionalNotePlaceholder") : t("reasonPlaceholder")}
            onChange={(event) => setNote(event.target.value)}
            style={{ fontSize: 13 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="sru-btn sru-btn-primary"
              disabled={pending || (!noteIsOptional && note.trim() === "")}
              onClick={() => run(openTarget, note.trim() === "" ? undefined : note)}
            >
              {t("confirm")}
            </button>
            <button
              type="button"
              className="sru-btn"
              disabled={pending}
              onClick={() => {
                setOpenTarget(null);
                setNote("");
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {state?.status === "error" && (
        <span role="alert" className="text-sm text-red-600" style={{ fontSize: 12.5 }}>
          {transitionRefusalMessages[state.message as keyof typeof transitionRefusalMessages] ??
            t("errorUnknown")}
        </span>
      )}
    </div>
  );
}
