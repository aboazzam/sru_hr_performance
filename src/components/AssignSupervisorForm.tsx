"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  assignSupervisor,
  type AssignSupervisorState,
} from "@/app/[locale]/(app)/employees/assign-supervisor/actions";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}

type ErrorMessage = Extract<AssignSupervisorState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function AssignSupervisorForm({ employees }: { employees: EmployeeOption[] }) {
  const t = useTranslations("AssignSupervisorPage");
  const [state, formAction, pending] = useActionState<AssignSupervisorState, FormData>(
    assignSupervisor,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  const inputClass =
    "w-full px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form ref={formRef} action={formAction} className="space-y-5 max-w-lg">
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
        <label className="block text-sm font-medium mb-1">{t("supervisorLabel")}</label>
        <select name="supervisorId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            {t("supervisorPlaceholder")}
          </option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.employee_number} — {employee.full_name_ar}
            </option>
          ))}
        </select>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
          {t("selfSupervisionHint")}
        </p>
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
