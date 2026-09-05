"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import {
  saveThreeSixtyExternalResponse,
  submitThreeSixtyExternalAssignment,
  type SubmitExternalAssignmentState,
} from "@/app/[locale]/three-sixty-external/[token]/actions";

interface ScaleOption {
  id: string;
  optionCode: string;
  labelAr: string;
  numericValue: number;
}

interface QuestionnaireItem {
  id: string;
  itemCode: string;
  itemType: "rating" | "open_text";
  textAr: string;
  required: boolean;
  options: ScaleOption[];
}

interface ExistingAnswer {
  optionId: string | null;
  numericValue: number | null;
  textValue: string | null;
}

/**
 * Mirrors `ThreeSixtyQuestionnaireForm` exactly (same radio/textarea UI,
 * same autosave-on-change, same required-items gate) but targets the
 * token-based external actions instead of the authenticated ones -- kept as
 * a separate component rather than parameterizing the existing one with
 * injectable actions, since the two call sites (an authenticated employee
 * vs. an anonymous emailed link) genuinely differ in more than just which
 * function to call (no `router.push` on success here -- there is no app
 * shell/session to navigate within).
 */
export function ThreeSixtyExternalQuestionnaireForm({
  token,
  items,
  existing,
  readOnly,
}: {
  token: string;
  items: QuestionnaireItem[];
  existing: Record<string, ExistingAnswer>;
  readOnly: boolean;
}) {
  const t = useTranslations("ThreeSixtyQuestionnairePage");
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, ExistingAnswer>>(existing);

  const [submitState, submitAction, submitting] = useActionState<SubmitExternalAssignmentState, FormData>(
    submitThreeSixtyExternalAssignment,
    null
  );

  function markSaved(itemId: string) {
    setSavedAt((prev) => ({ ...prev, [itemId]: true }));
    window.setTimeout(() => setSavedAt((prev) => ({ ...prev, [itemId]: false })), 2000);
  }

  function handleRating(item: QuestionnaireItem, option: ScaleOption) {
    setAnswers((prev) => ({ ...prev, [item.id]: { optionId: option.id, numericValue: option.numericValue, textValue: null } }));
    startTransition(async () => {
      const result = await saveThreeSixtyExternalResponse({
        token,
        itemId: item.id,
        optionId: option.id,
        numericValue: option.numericValue,
      });
      if (result.ok) markSaved(item.id);
    });
  }

  function handleTextBlur(item: QuestionnaireItem, value: string) {
    setAnswers((prev) => ({ ...prev, [item.id]: { optionId: null, numericValue: null, textValue: value } }));
    startTransition(async () => {
      const result = await saveThreeSixtyExternalResponse({ token, itemId: item.id, textValue: value });
      if (result.ok) markSaved(item.id);
    });
  }

  const missingRequired = items.filter((item) => {
    if (!item.required) return false;
    const a = answers[item.id];
    return !a || (a.optionId == null && (!a.textValue || a.textValue.trim() === ""));
  });

  if (submitState?.status === "success") {
    return (
      <div className="sru-card" style={{ padding: 20, textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>{t("externalSubmitSuccessTitle")}</p>
        <p style={{ fontSize: 12.5, color: "var(--sru-muted)", marginTop: 6 }}>{t("externalSubmitSuccessNote")}</p>
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => {
        const answer = answers[item.id];
        return (
          <section key={item.id} className="sru-formsection">
            <div className="sru-formsection-head">
              <div>
                <h3>
                  {item.textAr}
                  {item.required && <span style={{ color: "var(--sru-danger, #b91c1c)" }}> *</span>}
                </h3>
              </div>
              {savedAt[item.id] && (
                <span style={{ fontSize: 11, color: "var(--sru-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Check size={13} aria-hidden /> {t("savedIndicator")}
                </span>
              )}
            </div>

            {item.itemType === "rating" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {item.options.map((option) => (
                  <label
                    key={option.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12.5,
                      border: "1px solid var(--sru-border)",
                      borderRadius: 8,
                      padding: "6px 10px",
                    }}
                  >
                    <input
                      type="radio"
                      name={`item-${item.id}`}
                      disabled={readOnly}
                      checked={answer?.optionId === option.id}
                      onChange={() => handleRating(item, option)}
                    />
                    {option.labelAr}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                rows={3}
                defaultValue={answer?.textValue ?? ""}
                disabled={readOnly}
                onBlur={(e) => handleTextBlur(item, e.target.value)}
              />
            )}
          </section>
        );
      })}

      {!readOnly && (
        <>
          {missingRequired.length > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>{t("missingRequiredHint", { count: missingRequired.length })}</p>
          )}
          {submitState?.status === "error" && (
            <p role="alert" className="sru-auth-alert error">
              {t(submitState.message === "invalid_input" ? "errorMissingRequired" : "errorGeneric")}
            </p>
          )}
          <form action={submitAction} className="sru-form-submitrow">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="sru-btn sru-btn-primary" disabled={submitting || missingRequired.length > 0}>
              {submitting ? t("submitting") : t("submitButton")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
