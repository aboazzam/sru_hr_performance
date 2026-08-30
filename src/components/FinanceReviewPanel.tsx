"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Wallet } from "lucide-react";
import { computeBudgetVariance } from "@/lib/recruitmentPlanAnalytics";
import { isFinanceReviewEditable } from "@/lib/recruitmentWorkflow";
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
  plan_decided: "errorPlanDecided",
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

  /**
   * What is actually stored, kept apart from what is being typed.
   *
   * Reported directly: after saving, the button stayed active — so it looked
   * as though the review had not registered, and pressing it again would
   * re-stamp the very same figures. Re-saving is NOT removed, because
   * finance correcting its own number before approval is a real need and the
   * alternative is a "return for revision" round trip over a typo; it is the
   * NO-OP save that had to go.
   *
   * Updated from the successful save rather than from the props: the props do
   * refresh afterwards, but React keeps this component's state across that
   * re-render, so reading them here would leave the baseline behind.
   */
  const [savedBudget, setSavedBudget] = useState(
    initialApprovedBudget === null ? "" : String(initialApprovedBudget)
  );
  const [savedNote, setSavedNote] = useState(initialFinanceNote);

  const parsedBudget = budgetInput.trim() === "" ? null : Number(budgetInput);
  const budgetIsValid = parsedBudget === null || (Number.isFinite(parsedBudget) && parsedBudget >= 0);
  const preview = computeBudgetVariance(totalAnnualCost, budgetIsValid ? parsedBudget : null);

  const formatNumber = (value: number) => value.toLocaleString("ar-SA-u-nu-latn");
  const overBudget = preview.status === "over";

  // Compared as typed, so "500000" vs "500000.00" counts as a change — the
  // stored value genuinely differs, and claiming otherwise would block a
  // correction the reviewer means to make.
  const dirty = budgetInput.trim() !== savedBudget.trim() || note.trim() !== savedNote.trim();

  // The approver has ruled, so the review is closed. The server refuses the
  // write regardless; this only stops the screen from inviting an edit it
  // knows will be rejected, and says why.
  const locked = !isFinanceReviewEditable(status);

  function save() {
    startTransition(async () => {
      const result = await saveFinanceReview({
        planId,
        approvedBudget: parsedBudget,
        financeNote: note,
      });
      setState(result);
      if (result.status === "success") {
        setSavedBudget(budgetInput);
        setSavedNote(note);
        router.refresh();
      }
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
            type="number" lang="en"
            min={0}
            step="0.01"
            dir="ltr"
            value={budgetInput}
            disabled={locked}
            onChange={(event) => setBudgetInput(event.target.value)}
          />
        </label>
        <div className="sru-field">
          <span>{t("livePreview")}</span>
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
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
          <textarea rows={3} value={note} disabled={locked} onChange={(event) => setNote(event.target.value)} required />
        </label>
      </div>

      <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 6 }}>{t("noteMandatoryHint")}</p>

      <div className="sru-form-submitrow">
        {/* Inert until something actually differs from what is stored — the
            same rule the role editor and the org-structure rows already
            follow. And once a review exists the verb changes: pressing this
            amends a recorded review rather than creating one. */}
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          disabled={locked || pending || note.trim() === "" || !budgetIsValid || !dirty}
          onClick={save}
        >
          {pending ? t("saving") : alreadyReviewed ? t("updateReview") : t("saveReview")}
        </button>
        {alreadyReviewed && <span className="pill">{t("alreadyReviewed")}</span>}
        {/* Says WHY the button is inert. Without it a disabled button reads as
            a fault, which is how the active one read before. The closed
            reason wins: it is the one the reader cannot undo. */}
        {locked ? (
          <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("reviewLocked")}</span>
        ) : (
          alreadyReviewed &&
          !dirty &&
          !pending && (
            <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("noChangesToSave")}</span>
          )
        )}
        {state?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </span>
        )}
        {state?.status === "success" && (
          <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 12 }}>
            {t("reviewSaved")}
          </span>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--sru-border)", marginTop: 14, paddingTop: 14 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 8 }}>
          {t("financeActionsHint")}
        </p>
        <PlanWorkflowActions planId={planId} status={status} permissions={permissions} />
      </div>
    </div>
  );
}
