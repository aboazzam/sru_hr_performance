"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Target, Users } from "lucide-react";
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
    <form onSubmit={handleSubmit}>
      {subGoalId && <input type="hidden" name="subGoalId" value={subGoalId} />}
      {parentTargetId && <input type="hidden" name="parentTargetId" value={parentTargetId} />}

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Target size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionTargetInfoTitle")}</h3>
            <span>{t("sectionTargetInfoSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("titleLabel")}</label>
            <input type="text" name="titleAr" required dir="rtl" placeholder={t("titlePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("titleEnLabel")}</label>
            <input type="text" name="titleEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("titleEnPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("targetLabel")}</label>
            <input type="number" name="targetValue" required step="0.01" placeholder={t("targetPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("unitLabel")}</label>
            <input type="text" name="unitAr" required dir="rtl" placeholder={t("unitPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("unitEnLabel")}</label>
            <input type="text" name="unitEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("unitEnPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("weightLabel")}</label>
            <input type="number" name="weight" min="0.01" max="100" step="0.01" placeholder={t("weightPlaceholder")} />
          </div>
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Users size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionRecipientTitle")}</h3>
            <span>{t("sectionRecipientSubtitle")}</span>
          </div>
        </div>
        <div className="sru-field sru-scope-block">
          <label>{t("recipientTypeLabel")}</label>
          <div className="sru-scope-chip-row">
            <label className="sru-scope-chip">
              <input
                type="radio"
                name="recipientTypeChoice"
                checked={recipientType === "position"}
                onChange={() => setRecipientType("position")}
              />
              {t("recipientTypePosition")}
            </label>
            <label className="sru-scope-chip">
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
          <div className="sru-field">
            <label>{t("positionLabel")}</label>
            <select name="positionId" required defaultValue="">
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
          <div className="sru-field">
            <label>{t("employeeLabel")}</label>
            <select name="employeeId" required defaultValue="">
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
      </section>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
        </p>
      )}

      {state?.status === "success" && (
        <p role="status" className="sru-auth-alert success">
          <CheckCircle2 size={15} aria-hidden />
          {t("successMessage")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
          {pending ? t("submitting") : t("submit")}
        </button>
      </div>
    </form>
  );
}
