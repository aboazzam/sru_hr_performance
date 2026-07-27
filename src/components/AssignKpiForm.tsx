"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { assignKpi, type AssignKpiState } from "@/app/[locale]/(app)/kpis/assign/actions";

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

interface KpiLibraryOption {
  id: string;
  title_ar: string;
  default_weight: number | null;
  unit_ar: string;
}

type ErrorMessage = Extract<AssignKpiState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function AssignKpiForm({
  employees,
  cycles,
  kpiLibrary,
}: {
  employees: EmployeeOption[];
  cycles: CycleOption[];
  kpiLibrary: KpiLibraryOption[];
}) {
  const t = useTranslations("AssignKpiPage");
  const [state, formAction, pending] = useActionState<AssignKpiState, FormData>(assignKpi, null);
  const formRef = useRef<HTMLFormElement>(null);
  const kpiLibrarySelectRef = useRef<HTMLSelectElement>(null);
  const customTitleInputRef = useRef<HTMLInputElement>(null);
  const unitInputRef = useRef<HTMLInputElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      if (customTitleInputRef.current) customTitleInputRef.current.disabled = false;
    }
  }, [state]);

  // See AssignGoalForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  function handleLibrarySelect(id: string) {
    const kpi = kpiLibrary.find((k) => k.id === id);
    if (kpi && customTitleInputRef.current) {
      customTitleInputRef.current.value = "";
      customTitleInputRef.current.disabled = true;
      if (unitInputRef.current) unitInputRef.current.value = kpi.unit_ar;
      if (weightInputRef.current && kpi.default_weight != null) weightInputRef.current.value = String(kpi.default_weight);
    } else if (customTitleInputRef.current) {
      customTitleInputRef.current.disabled = false;
    }
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
        <label className="block text-sm font-medium mb-1">{t("kpiLibraryLabel")}</label>
        <select
          name="kpiLibraryId"
          ref={kpiLibrarySelectRef}
          className={inputClass}
          defaultValue=""
          onChange={(e) => handleLibrarySelect(e.target.value)}
        >
          <option value="">{t("kpiLibraryPlaceholder")}</option>
          {kpiLibrary.map((kpi) => (
            <option key={kpi.id} value={kpi.id}>
              {kpi.title_ar}
              {kpi.default_weight != null ? ` (${kpi.default_weight}%)` : ""}
            </option>
          ))}
        </select>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("kpiSourceHint")}</p>
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
            if (e.target.value && kpiLibrarySelectRef.current) {
              kpiLibrarySelectRef.current.value = "";
            }
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("targetLabel")}</label>
          <input
            type="number"
            name="targetValue"
            required
            step="0.01"
            className={inputClass}
            placeholder={t("targetPlaceholder")}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("actualLabel")}</label>
          <input
            type="number"
            name="actualValue"
            step="0.01"
            className={inputClass}
            placeholder={t("actualPlaceholder")}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("unitLabel")}</label>
        <input
          type="text"
          name="unitAr"
          ref={unitInputRef}
          required
          dir="rtl"
          className={inputClass}
          placeholder={t("unitPlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t("weightLabel")}</label>
        <input
          type="number"
          name="weight"
          ref={weightInputRef}
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
