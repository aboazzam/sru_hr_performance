"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createEvaluation, type CreateEvaluationState } from "@/app/[locale]/(app)/evaluations/new/actions";
import type { Locale } from "@/i18n/config";
import { evalTypes, evalTypeLabels } from "@/lib/vpra";

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

type ErrorMessage = Extract<CreateEvaluationState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export function CreateEvaluationForm({
  locale,
  employees,
  cycles,
  defaultCycleId,
}: {
  locale: Locale;
  employees: EmployeeOption[];
  cycles: CycleOption[];
  defaultCycleId?: string;
}) {
  const t = useTranslations("CreateEvaluationPage");
  const [state, formAction, pending] = useActionState<CreateEvaluationState, FormData>(
    createEvaluation.bind(null, locale),
    null
  );

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
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
        <select name="cycleId" required className={inputClass} defaultValue={defaultCycleId ?? ""}>
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
        <label className="block text-sm font-medium mb-1">{t("evalTypeLabel")}</label>
        <select name="evalType" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("evalTypePlaceholder")}
          </option>
          {evalTypes.map((type) => (
            <option key={type} value={type}>
              {evalTypeLabels[type]}
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
