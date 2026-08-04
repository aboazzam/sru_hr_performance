"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  proposePromotion,
  type ProposePromotionState,
} from "@/app/[locale]/(app)/promotions/new/actions";
import type { Locale } from "@/i18n/config";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
  /** The employee's own recorded job title — used to prefill "from". */
  job_title_id: string | null;
}

export interface CareerEdgeOption {
  fromJobTitleId: string;
  toJobTitleId: string;
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
  careerEdges,
}: {
  locale: Locale;
  employees: EmployeeOption[];
  cycles: CycleOption[];
  jobTitles: JobTitleOption[];
  careerEdges: CareerEdgeOption[];
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
  const [employeeId, setEmployeeId] = useState("");
  const [onlyCareerPath, setOnlyCareerPath] = useState(true);

  const trimmedFromSearch = fromSearch.trim();
  const filteredFromJobTitles =
    trimmedFromSearch === ""
      ? jobTitles
      : jobTitles.filter((title) => includesIgnoringHamza(title.name_ar, trimmedFromSearch));
  const effectiveFromJobTitleId = filteredFromJobTitles.some((title) => title.id === fromJobTitleId) ? fromJobTitleId : "";

  // The moves the university's own career ladder defines out of the chosen
  // current title (`career_path`, 155+ real edges). Used to narrow the "to"
  // list — never to block: an off-ladder promotion is a real managerial
  // decision, so the restriction is an opt-out checkbox, and it silently
  // does nothing when the ladder defines no next step for this title.
  const nextStepIds = new Set(
    careerEdges.filter((e) => e.fromJobTitleId === effectiveFromJobTitleId).map((e) => e.toJobTitleId)
  );
  const careerPathFilterActive = onlyCareerPath && nextStepIds.size > 0;

  const trimmedToSearch = toSearch.trim();
  const toCandidates = careerPathFilterActive ? jobTitles.filter((title) => nextStepIds.has(title.id)) : jobTitles;
  const filteredToJobTitles =
    trimmedToSearch === ""
      ? toCandidates
      : toCandidates.filter((title) => includesIgnoringHamza(title.name_ar, trimmedToSearch));
  const effectiveToJobTitleId = filteredToJobTitles.some((title) => title.id === toJobTitleId) ? toJobTitleId : "";

  /**
   * Picking an employee prefills "from" with the job title actually recorded
   * on their profile — previously it was typed by hand even though the data
   * was already there. Any explicit later change to "from" still wins, since
   * this only fires on employee change.
   */
  function handleEmployeeChange(nextEmployeeId: string) {
    setEmployeeId(nextEmployeeId);
    const employee = employees.find((e) => e.id === nextEmployeeId);
    setFromSearch("");
    setFromJobTitleId(employee?.job_title_id ?? "");
    setToSearch("");
    setToJobTitleId("");
  }

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
        <select
          name="employeeId"
          required
          className={inputClass}
          value={employeeId}
          onChange={(e) => handleEmployeeChange(e.target.value)}
        >
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
        {nextStepIds.size > 0 ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={onlyCareerPath}
              onChange={(e) => setOnlyCareerPath(e.target.checked)}
            />
            <span>{t("onlyCareerPathSteps", { count: nextStepIds.size })}</span>
          </label>
        ) : (
          effectiveFromJobTitleId !== "" && (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 6 }}>{t("noCareerPathSteps")}</p>
          )
        )}
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
