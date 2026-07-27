"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createSubGoal, type CreateSubGoalState } from "@/app/[locale]/(app)/kpis/strategic-goals/[id]/sub-goals/new/actions";
import type { Locale } from "@/i18n/config";

interface PositionOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<CreateSubGoalState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function NewSubGoalForm({
  locale,
  strategicGoalId,
  positions,
}: {
  locale: Locale;
  strategicGoalId: string;
  positions: PositionOption[];
}) {
  const t = useTranslations("NewSubGoalPage");
  const [state, formAction, pending] = useActionState<CreateSubGoalState, FormData>(createSubGoal.bind(null, locale), null);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <input type="hidden" name="strategicGoalId" value={strategicGoalId} />

      <div>
        <label className="block text-sm font-medium mb-1">{t("titleLabel")}</label>
        <input type="text" name="titleAr" required dir="rtl" className={inputClass} placeholder={t("titlePlaceholder")} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("descriptionLabel")}</label>
        <textarea name="descriptionAr" dir="rtl" rows={3} className={inputClass} placeholder={t("descriptionPlaceholder")} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("ownerPositionLabel")}</label>
        <select name="ownerPositionId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("ownerPositionPlaceholder")}
          </option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("targetLabel")}</label>
          <input type="number" name="targetValue" step="0.01" className={inputClass} placeholder={t("targetPlaceholder")} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("unitLabel")}</label>
          <input type="text" name="unitAr" required dir="rtl" className={inputClass} placeholder={t("unitPlaceholder")} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("weightLabel")}</label>
        <input
          type="number"
          name="weight"
          min="0.01"
          max="100"
          step="0.01"
          className={inputClass}
          placeholder={t("weightPlaceholder")}
        />
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2 rounded-lg bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
