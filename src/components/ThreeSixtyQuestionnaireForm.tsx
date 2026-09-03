"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Check } from "lucide-react";
import { saveThreeSixtyResponse } from "@/app/[locale]/(app)/three-sixty/rate/[assignmentId]/actions";
import { submitThreeSixtyAssignment, type SubmitAssignmentState } from "@/app/[locale]/(app)/three-sixty/rate/[assignmentId]/actions";

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

export function ThreeSixtyQuestionnaireForm({
  assignmentId,
  items,
  existing,
  readOnly,
}: {
  assignmentId: string;
  items: QuestionnaireItem[];
  existing: Record<string, ExistingAnswer>;
  readOnly: boolean;
}) {
  const t = useTranslations("ThreeSixtyQuestionnairePage");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, ExistingAnswer>>(existing);

  const [submitState, submitAction, submitting] = useActionState<SubmitAssignmentState, FormData>(
    submitThreeSixtyAssignment,
    null
  );

  if (submitState?.status === "success") {
    startTransition(() => router.push("/three-sixty/rate"));
  }

  function markSaved(itemId: string) {
    setSavedAt((prev) => ({ ...prev, [itemId]: true }));
    window.setTimeout(() => setSavedAt((prev) => ({ ...prev, [itemId]: false })), 2000);
  }

  function handleRating(item: QuestionnaireItem, option: ScaleOption) {
    setAnswers((prev) => ({ ...prev, [item.id]: { optionId: option.id, numericValue: option.numericValue, textValue: null } }));
    startTransition(async () => {
      const result = await saveThreeSixtyResponse({
        assignmentId,
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
      const result = await saveThreeSixtyResponse({ assignmentId, itemId: item.id, textValue: value });
      if (result.ok) markSaved(item.id);
    });
  }

  const missingRequired = items.filter((item) => {
    if (!item.required) return false;
    const a = answers[item.id];
    return !a || (a.optionId == null && (!a.textValue || a.textValue.trim() === ""));
  });

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
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <button type="submit" className="sru-btn sru-btn-primary" disabled={submitting || missingRequired.length > 0}>
              {submitting ? t("submitting") : t("submitButton")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
