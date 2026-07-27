"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { createStrategicGoal, type CreateStrategicGoalState } from "@/app/[locale]/(app)/kpis/strategic-goals/new/actions";
import type { Locale } from "@/i18n/config";

interface CycleOption {
  id: string;
  name_ar: string;
  start_date: string;
  end_date: string;
}

type ErrorMessage = Extract<CreateStrategicGoalState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function NewStrategicGoalForm({ locale, cycles }: { locale: Locale; cycles: CycleOption[] }) {
  const t = useTranslations("NewStrategicGoalPage");
  const [state, formAction, pending] = useActionState<CreateStrategicGoalState, FormData>(
    createStrategicGoal.bind(null, locale),
    null
  );

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
      <div>
        <label className="block text-sm font-medium mb-1">{t("cycleLabel")}</label>
        <select name="cycleId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("cyclePlaceholder")}
          </option>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.name_ar} ({cycle.start_date} – {cycle.end_date})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("titleLabel")}</label>
        <input type="text" name="titleAr" required dir="rtl" className={inputClass} placeholder={t("titlePlaceholder")} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("descriptionLabel")}</label>
        <textarea name="descriptionAr" dir="rtl" rows={3} className={inputClass} placeholder={t("descriptionPlaceholder")} />
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
