"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { assignTarget, type AssignTargetState } from "@/app/[locale]/(app)/kpis/assign/actions";
import type { Locale } from "@/i18n/config";

interface PositionOption {
  id: string;
  name_ar: string;
}

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}

type ErrorMessage = Extract<AssignTargetState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function AssignTargetForm({
  locale,
  subGoalId,
  parentTargetId,
  positions,
  employees,
}: {
  locale: Locale;
  subGoalId?: string;
  parentTargetId?: string;
  positions: PositionOption[];
  employees: EmployeeOption[];
}) {
  const t = useTranslations("AssignTargetPage");
  const [state, formAction, pending] = useActionState<AssignTargetState, FormData>(assignTarget.bind(null, locale), null);
  const [recipientType, setRecipientType] = useState<"position" | "employee">("position");

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
      {subGoalId && <input type="hidden" name="subGoalId" value={subGoalId} />}
      {parentTargetId && <input type="hidden" name="parentTargetId" value={parentTargetId} />}

      <div>
        <label className="block text-sm font-medium mb-1">{t("titleLabel")}</label>
        <input type="text" name="titleAr" required dir="rtl" className={inputClass} placeholder={t("titlePlaceholder")} />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("targetLabel")}</label>
          <input type="number" name="targetValue" required step="0.01" className={inputClass} placeholder={t("targetPlaceholder")} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="block text-sm font-medium mb-1">{t("unitLabel")}</label>
          <input type="text" name="unitAr" required dir="rtl" className={inputClass} placeholder={t("unitPlaceholder")} />
        </div>
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
        <label className="block text-sm font-medium mb-2">{t("recipientTypeLabel")}</label>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="recipientTypeChoice"
              checked={recipientType === "position"}
              onChange={() => setRecipientType("position")}
            />
            {t("recipientTypePosition")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="recipientTypeChoice"
              checked={recipientType === "employee"}
              onChange={() => setRecipientType("employee")}
            />
            {t("recipientTypeEmployee")}
          </label>
        </div>
      </div>

      {recipientType === "position" ? (
        <div>
          <label className="block text-sm font-medium mb-1">{t("positionLabel")}</label>
          <select name="positionId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              {t("positionPlaceholder")}
            </option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name_ar}
              </option>
            ))}
          </select>
        </div>
      ) : (
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
      )}

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
