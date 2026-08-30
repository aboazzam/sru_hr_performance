"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Target, Users } from "lucide-react";
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

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Users size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionTargetTitle")}</h3>
            <span>{t("sectionTargetSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
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

          <div className="sru-field">
            <label>{t("cycleLabel")}</label>
            <select name="cycleId" required defaultValue="">
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
        </div>
      </section>

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Target size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionGoalDetailsTitle")}</h3>
            <span>{t("sectionGoalDetailsSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("goalLibraryLabel")}</label>
            <select
              name="goalLibraryId"
              ref={goalLibrarySelectRef}
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
          </div>

          <div className="sru-field">
            <label>{t("customTitleLabel")}</label>
            <input
              type="text"
              name="customTitleAr"
              ref={customTitleInputRef}
              dir="rtl"
              placeholder={t("customTitlePlaceholder")}
              onChange={(e) => {
                if (e.target.value && goalLibrarySelectRef.current) {
                  goalLibrarySelectRef.current.value = "";
                }
              }}
            />
          </div>

          <div className="sru-field">
            <label>{t("weightLabel")}</label>
            <input type="number" lang="en" name="weight" min="0.01" max="100" step="0.01" placeholder={t("weightPlaceholder")} />
          </div>
        </div>

        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: -6, marginBottom: 16 }}>
          {t("goalSourceHint")}
        </p>

        <div className="sru-field">
          <label>{t("targetLabel")}</label>
          <textarea name="targetAr" dir="rtl" rows={3} placeholder={t("targetPlaceholder")} />
        </div>
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
