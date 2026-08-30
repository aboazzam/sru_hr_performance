"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, ListChecks, UserCheck } from "lucide-react";
import { assignBauTask, type AssignBauTaskState } from "@/app/[locale]/(app)/bau-tasks/actions";

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

type ErrorMessage = Extract<AssignBauTaskState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function BauTaskForm({
  employees,
  cycles,
}: {
  employees: EmployeeOption[];
  cycles: CycleOption[];
}) {
  const t = useTranslations("BauTasksPage");
  const [state, formAction, pending] = useActionState<AssignBauTaskState, FormData>(
    assignBauTask,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
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

  // Restyled to the add-employee form's shape, asked for directly: labelled
  // sections with an icon badge, the shared `sru-field` controls, and a
  // submit row — instead of this screen's own one-off Tailwind utility
  // classes, which were the last place in the app still styling inputs by
  // hand.
  //
  // Two sections rather than one flat stack, split the way the questions
  // actually differ: WHO the task is for and in which cycle, then WHAT the
  // task is. The same reasoning that gives the employee form its sections.
  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <UserCheck size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionAssignTitle")}</h3>
            <span>{t("sectionAssignSubtitle")}</span>
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
            <ListChecks size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionTaskTitle")}</h3>
            <span>{t("sectionTaskSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("titleArLabel")}</label>
            <input type="text" name="titleAr" required dir="rtl" placeholder={t("titleArPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("titleEnLabel")}</label>
            <input
              type="text"
              name="titleEn"
              dir="ltr"
              style={{ textAlign: "left" }}
              placeholder={t("titleEnPlaceholder")}
            />
          </div>
          <div className="sru-field">
            <label>{t("weightLabel")}</label>
            <input
              type="number" lang="en"
              name="weight"
              min="0.01"
              max="100"
              step="0.01"
              dir="ltr"
              style={{ textAlign: "left" }}
              placeholder={t("weightPlaceholder")}
            />
          </div>
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
