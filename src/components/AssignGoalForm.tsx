"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { assignGoal, type AssignGoalState } from "@/app/[locale]/(app)/goals/assign/actions";

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

interface GoalLibraryOption {
  id: string;
  title_ar: string;
  default_weight: number | null;
}

type ErrorMessage = Extract<AssignGoalState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function AssignGoalForm({
  employees,
  cycles,
  goalLibrary,
}: {
  employees: EmployeeOption[];
  cycles: CycleOption[];
  goalLibrary: GoalLibraryOption[];
}) {
  const t = useTranslations("AssignGoalPage");
  const [state, formAction, pending] = useActionState<AssignGoalState, FormData>(
    assignGoal,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const goalLibrarySelectRef = useRef<HTMLSelectElement>(null);
  const customTitleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      if (customTitleInputRef.current) customTitleInputRef.current.disabled = false;
    }
  }, [state]);

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 max-w-lg">
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
        <label className="block text-sm font-medium mb-1">{t("goalLibraryLabel")}</label>
        <select
          name="goalLibraryId"
          ref={goalLibrarySelectRef}
          className={inputClass}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value && customTitleInputRef.current) {
              customTitleInputRef.current.value = "";
              customTitleInputRef.current.disabled = true;
            } else if (customTitleInputRef.current) {
              customTitleInputRef.current.disabled = false;
            }
          }}
        >
          <option value="">{t("goalLibraryPlaceholder")}</option>
          {goalLibrary.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title_ar}
              {goal.default_weight != null ? ` (${goal.default_weight}%)` : ""}
            </option>
          ))}
        </select>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
          {t("goalSourceHint")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("customTitleLabel")}</label>
        <input
          type="text"
          name="customTitleAr"
          ref={customTitleInputRef}
          dir="rtl"
          className={inputClass}
          placeholder={t("customTitlePlaceholder")}
          onChange={(e) => {
            if (e.target.value && goalLibrarySelectRef.current) {
              goalLibrarySelectRef.current.value = "";
            }
          }}
        />
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

      <div>
        <label className="block text-sm font-medium mb-1">{t("targetLabel")}</label>
        <textarea
          name="targetAr"
          dir="rtl"
          rows={3}
          className={inputClass}
          placeholder={t("targetPlaceholder")}
        />
      </div>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="text-sm text-green-700">
          {t("successMessage")}
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
