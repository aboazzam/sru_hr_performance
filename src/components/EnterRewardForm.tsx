"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { enterReward, type EnterRewardState } from "@/app/[locale]/(app)/rewards/new/actions";
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

type ErrorMessage = Extract<EnterRewardState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function EnterRewardForm({
  locale,
  employees,
  cycles,
}: {
  locale: Locale;
  employees: EmployeeOption[];
  cycles: CycleOption[];
}) {
  const t = useTranslations("EnterRewardPage");
  const [state, formAction, pending] = useActionState<EnterRewardState, FormData>(
    enterReward.bind(null, locale),
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
        <label className="block text-sm font-medium mb-1">{t("rewardTypeLabel")}</label>
        <input
          type="text"
          name="rewardType"
          required
          dir="rtl"
          className={inputClass}
          placeholder={t("rewardTypePlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("amountLabel")}</label>
        <input
          type="number"
          name="amount"
          min="0"
          step="0.01"
          className={inputClass}
          placeholder={t("amountPlaceholder")}
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
