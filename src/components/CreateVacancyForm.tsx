"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  createVacancy,
  type CreateVacancyState,
} from "@/app/[locale]/(app)/vacancies/new/actions";
import type { Locale } from "@/i18n/config";

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<CreateVacancyState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CreateVacancyForm({
  locale,
  jobTitles,
  orgUnits,
}: {
  locale: Locale;
  jobTitles: JobTitleOption[];
  orgUnits: OrgUnitOption[];
}) {
  const t = useTranslations("CreateVacancyPage");
  const [state, formAction, pending] = useActionState<CreateVacancyState, FormData>(
    createVacancy.bind(null, locale),
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
        <label className="block text-sm font-medium mb-1">{t("jobTitleLabel")}</label>
        <select name="jobTitleId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("jobTitlePlaceholder")}
          </option>
          {jobTitles.map((title) => (
            <option key={title.id} value={title.id}>
              {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
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
        <label className="block text-sm font-medium mb-1">{t("requirementsLabel")}</label>
        <textarea
          name="requirementsAr"
          dir="rtl"
          rows={3}
          className={inputClass}
          placeholder={t("requirementsPlaceholder")}
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
