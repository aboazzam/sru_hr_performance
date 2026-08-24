"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  createCalibrationSession,
  type CreateCalibrationSessionState,
} from "@/app/[locale]/(app)/calibration/new/actions";
import type { Locale } from "@/i18n/config";

interface CycleOption {
  id: string;
  name_ar: string;
  start_date: string;
  end_date: string;
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<CreateCalibrationSessionState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CreateCalibrationSessionForm({
  locale,
  cycles,
  orgUnits,
}: {
  locale: Locale;
  cycles: CycleOption[];
  orgUnits: OrgUnitOption[];
}) {
  const t = useTranslations("CreateCalibrationSessionPage");
  const [state, formAction, pending] = useActionState<CreateCalibrationSessionState, FormData>(
    createCalibrationSession.bind(null, locale),
    null
  );

  const inputClass =
    "w-full px-4 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

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
        <label className="block text-sm font-medium mb-1">{t("orgUnitLabel")}</label>
        <select name="orgUnitId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("orgUnitPlaceholder")}
          </option>
          {orgUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("notesLabel")}</label>
        <textarea
          name="notes"
          dir="rtl"
          rows={3}
          className={inputClass}
          placeholder={t("notesPlaceholder")}
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
        className="w-full py-2 bg-[var(--color-primary)] text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
