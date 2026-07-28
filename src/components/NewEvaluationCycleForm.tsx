"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  createEvaluationCycle,
  type CreateEvaluationCycleState,
  type EvaluationCycleType,
} from "@/app/[locale]/(app)/evaluations/cycles/new/actions";
import type { Locale } from "@/i18n/config";

type ErrorMessage = Extract<CreateEvaluationCycleState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

const cycleTypeOptions: EvaluationCycleType[] = ["academic", "calendar", "fiscal"];

const cycleTypeLabelKeys: Record<EvaluationCycleType, string> = {
  academic: "cycleTypeAcademic",
  calendar: "cycleTypeCalendar",
  fiscal: "cycleTypeFiscal",
};

export function NewEvaluationCycleForm({ locale }: { locale: Locale }) {
  const t = useTranslations("NewEvaluationCyclePage");
  const [state, formAction, pending] = useActionState<CreateEvaluationCycleState, FormData>(
    createEvaluationCycle.bind(null, locale),
    null
  );
  // Progressive disclosure: the date fields only make sense once a period
  // type is chosen (requested directly — pick the type first, then dates).
  const [cycleType, setCycleType] = useState<EvaluationCycleType | "">("");

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
        <label className="block text-sm font-medium mb-1">{t("cycleTypeLabel")}</label>
        <select
          name="cycleType"
          required
          className={inputClass}
          value={cycleType}
          onChange={(event) => setCycleType(event.target.value as EvaluationCycleType)}
        >
          <option value="" disabled>
            {t("cycleTypePlaceholder")}
          </option>
          {cycleTypeOptions.map((type) => (
            <option key={type} value={type}>
              {t(cycleTypeLabelKeys[type])}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("nameArLabel")}</label>
        <input type="text" name="nameAr" required dir="rtl" className={inputClass} placeholder={t("nameArPlaceholder")} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("nameEnLabel")}</label>
        <input type="text" name="nameEn" dir="ltr" className={inputClass} placeholder={t("nameEnPlaceholder")} />
      </div>

      {cycleType !== "" && (
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="block text-sm font-medium mb-1">{t("startDateLabel")}</label>
            <input type="date" name="startDate" required dir="ltr" className={inputClass} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="block text-sm font-medium mb-1">{t("endDateLabel")}</label>
            <input type="date" name="endDate" required dir="ltr" className={inputClass} />
          </div>
        </div>
      )}

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
