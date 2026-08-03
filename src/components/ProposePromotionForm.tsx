"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  proposePromotion,
  type ProposePromotionState,
} from "@/app/[locale]/(app)/promotions/new/actions";
import type { Locale } from "@/i18n/config";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}

interface CycleOption {
  id: string;
  name_ar: string;
  start_date: string;
  end_date: string;
}

interface JobTitleOption {
  id: string;
  name_ar: string;
  grade_level: number;
}

type ErrorMessage = Extract<ProposePromotionState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function ProposePromotionForm({
  locale,
  employees,
  cycles,
  jobTitles,
}: {
  locale: Locale;
  employees: EmployeeOption[];
  cycles: CycleOption[];
  jobTitles: JobTitleOption[];
}) {
  const t = useTranslations("ProposePromotionPage");
  const [state, formAction, pending] = useActionState<ProposePromotionState, FormData>(
    proposePromotion.bind(null, locale),
    null
  );

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  // Job-title lists here run into the hundreds of rows (real seeded data), making
  // a bare <select> impractical to scan — same problem already fixed for
  // CareerPathEdgesManager/CreateJobTitleForm's job-title selects: a text filter
  // narrows the <select>'s own option list rather than replacing it with a
  // custom combobox, with a derived-during-render fallback so the current
  // selection stays valid as the filtered set shrinks.
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [fromJobTitleId, setFromJobTitleId] = useState("");
  const [toJobTitleId, setToJobTitleId] = useState("");

  const trimmedFromSearch = fromSearch.trim();
  const filteredFromJobTitles =
    trimmedFromSearch === "" ? jobTitles : jobTitles.filter((title) => title.name_ar.includes(trimmedFromSearch));
  const effectiveFromJobTitleId = filteredFromJobTitles.some((title) => title.id === fromJobTitleId) ? fromJobTitleId : "";

  const trimmedToSearch = toSearch.trim();
  const filteredToJobTitles =
    trimmedToSearch === "" ? jobTitles : jobTitles.filter((title) => title.name_ar.includes(trimmedToSearch));
  const effectiveToJobTitleId = filteredToJobTitles.some((title) => title.id === toJobTitleId) ? toJobTitleId : "";

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
        <label className="block text-sm font-medium mb-1">{t("employeeLabel")}</label>
        <select name="employeeId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("employeePlaceholder")}
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.employee_number} — {employee.full_name_ar}
            </option>
          ))}
        </select>
      </div>

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
        <label className="block text-sm font-medium mb-1">{t("fromJobTitleLabel")}</label>
        <input
          type="text"
          value={fromSearch}
          onChange={(e) => setFromSearch(e.target.value)}
          placeholder={t("jobTitleSearchPlaceholder")}
          dir="rtl"
          className={inputClass}
          style={{ marginBottom: 6 }}
        />
        <select
          name="fromJobTitleId"
          className={inputClass}
          value={effectiveFromJobTitleId}
          onChange={(e) => setFromJobTitleId(e.target.value)}
        >
          <option value="">{t("fromJobTitlePlaceholder")}</option>
          {filteredFromJobTitles.length === 0 ? (
            <option value="" disabled>
              {t("jobTitleNoMatches")}
            </option>
          ) : (
            filteredFromJobTitles.map((title) => (
              <option key={title.id} value={title.id}>
                {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
              </option>
            ))
          )}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("toJobTitleLabel")}</label>
        <input
          type="text"
          value={toSearch}
          onChange={(e) => setToSearch(e.target.value)}
          placeholder={t("jobTitleSearchPlaceholder")}
          dir="rtl"
          className={inputClass}
          style={{ marginBottom: 6 }}
        />
        <select
          name="toJobTitleId"
          required
          className={inputClass}
          value={effectiveToJobTitleId}
          onChange={(e) => setToJobTitleId(e.target.value)}
          disabled={filteredToJobTitles.length === 0}
        >
          <option value="" disabled>
            {filteredToJobTitles.length === 0 ? t("jobTitleNoMatches") : t("toJobTitlePlaceholder")}
          </option>
          {filteredToJobTitles.map((title) => (
            <option key={title.id} value={title.id}>
              {title.name_ar} ({t("gradeLabel", { grade: title.grade_level })})
            </option>
          ))}
        </select>
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
