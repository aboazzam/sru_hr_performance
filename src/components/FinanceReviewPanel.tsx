"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Wallet } from "lucide-react";
import { computeBudgetVariance } from "@/lib/recruitmentPlanAnalytics";
import { PlanWorkflowActions } from "@/components/PlanWorkflowActions";
import type { RecruitmentPermissions } from "@/lib/recruitmentWorkflow";
import {
  saveFinanceReview,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  not_found: "errorNotFound",
  unknown: "errorUnknown",
};

/**
 * The finance review: the approved budget against the plan's own annual
 * figure, with the variance recomputed LIVE as the reviewer types — using
 * the same `computeBudgetVariance` the dashboard uses, so the preview and
 * the saved result can never disagree.
 *
 * The note is mandatory (the spec's own rule: finance takes no action
 * without recording one), enforced both here and in `saveFinanceReview`.
 */
export function FinanceReviewPanel({
  planId,
  status,
  permissions,
  totalAnnualCost,
  initialApprovedBudget,
  initialFinanceNote,
  alreadyReviewed,
}: {
  planId: string;
  status: string;
  permissions: RecruitmentPermissions;
  totalAnnualCost: number;
  initialApprovedBudget: number | null;
  initialFinanceNote: string;
  alreadyReviewed: boolean;
  initialVarianceStatus?: string;
}) {
  const t = useTranslations("RecruitmentFinancePage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);
  const [budgetInput, setBudgetInput] = useState(
    initialApprovedBudget === null ? "" : String(initialApprovedBudget)
  );
  const [note, setNote] = useState(initialFinanceNote);

  const parsedBudget = budgetInput.trim() === "" ? null : Number(budgetInput);
  const budgetIsValid = parsedBudget === null || (Number.isFinite(parsedBudget) && parsedBudget >= 0);
  const preview = computeBudgetVariance(totalAnnualCost, budgetIsValid ? parsedBudget : null);

  const formatNumber = (value: number) => value.toLocaleString("ar-SA");
  const overBudget = preview.status === "over";

  function save() {
    startTransition(async () => {
      const result = await saveFinanceReview({
        planId,
        approvedBudget: parsedBudget,
        financeNote: note,
      });
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="sru-formsection">
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Wallet size={16} aria-hidden />
        </span>
        <h2>{t("reviewHeading")}</h2>
      </div>

      <div className="sru-formgrid">
        <label className="sru-field">
          <span>{t("fieldApprovedBudget")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={budgetInput}
            onChange={(event) => setBudgetInput(event.target.value)}
          />
        </label>
        <div className="sru-field">
          <span>{t("livePreview")}</span>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            {preview.status === "no_budget" ? (
              <span style={{ color: "var(--sru-muted)" }}>{t("noBudgetYet")}</span>
            ) : (
              <>
                <div>
                  {t("varianceLabel")}{" "}
                  <strong style={{ color: overBudget ? "#b91c1c" : "#15803d" }}>
                    {formatNumber(preview.variance ?? 0)}
                  </strong>
                </div>
                {preview.consumedPercentage !== null && (
                  <div>
                    {t("consumedLabel")}{" "}
                    <strong style={{ color: overBudget ? "#b91c1c" : "#15803d" }}>
                      {formatNumber(Math.round(preview.consumedPercentage))}%
                    </strong>
                  </div>
                )}
                {overBudget && <div style={{ color: "#b91c1c" }}>{t("overBudgetWarning")}</div>}
              </>
            )}
          </div>
        </div>

        <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <span>{t("fieldFinanceNote")}</span>
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required />
        </label>
      </div>

      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 6 }}>{t("noteMandatoryHint")}</p>

      <div className="sru-form-submitrow">
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          disabled={pending || note.trim() === "" || !budgetIsValid}
          onClick={save}
        >
          {pending ? t("saving") : t("saveReview")}
        </button>
        {alreadyReviewed && <span className="pill">{t("alreadyReviewed")}</span>}
        {state?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </span>
        )}
        {state?.status === "success" && (
          <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
            {t("reviewSaved")}
          </span>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--sru-border)", marginTop: 14, paddingTop: 14 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 8 }}>
          {t("financeActionsHint")}
        </p>
        <PlanWorkflowActions planId={planId} status={status} permissions={permissions} />
      </div>
    </div>
  );
}
