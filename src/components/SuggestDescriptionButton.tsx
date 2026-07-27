"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { suggestJobDescription } from "@/app/[locale]/(app)/career-path/job-titles/actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "aiErrorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  rate_limited: "aiErrorRateLimited",
  ai_error: "aiErrorGeneric",
  unknown: "errorUnknown",
};

/**
 * Calls the live suggestJobDescription Server Action (a real, billed
 * Anthropic API request — rate-limited server-side) and hands the
 * suggested text to the caller via onSuggested. Never saves anything
 * itself; the caller's own textarea + Save button remain the only path to
 * persisting a description, so a human always reviews the draft first.
 */
export function SuggestDescriptionButton({
  nameAr,
  familyNameAr,
  gradeLevel,
  category,
  qualificationRequired,
  onSuggested,
  disabled,
}: {
  nameAr: string;
  familyNameAr: string;
  gradeLevel: number | null;
  category: string;
  qualificationRequired?: string;
  onSuggested: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("CareerPathJobTitleDetailPage");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSuggest = !disabled && nameAr.trim().length > 0 && familyNameAr.trim().length > 0 && !!gradeLevel && !!category;

  function handleClick() {
    if (!canSuggest || !gradeLevel) return;
    setError(null);
    startTransition(async () => {
      const res = await suggestJobDescription({
        nameAr,
        familyNameAr,
        gradeLevel,
        category,
        qualificationRequired,
      });
      if (res.status === "success") {
        onSuggested(res.descriptionAr);
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div>
      <button type="button" disabled={!canSuggest || isPending} onClick={handleClick} className="sru-btn">
        {isPending ? t("aiSuggesting") : t("aiSuggestButton")}
      </button>
      {!canSuggest && !isPending && <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: 4 }}>{t("aiSuggestNeedsFields")}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 6 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
