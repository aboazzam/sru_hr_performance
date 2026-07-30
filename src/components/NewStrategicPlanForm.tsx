"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CalendarRange, CheckCircle2 } from "lucide-react";
import { createStrategicPlan, type CreatePlanState } from "@/app/[locale]/(app)/kpis/plans/actions";

type ErrorMessage = Extract<CreatePlanState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function NewStrategicPlanForm() {
  const t = useTranslations("StrategicPlansPage");
  const [state, formAction, pending] = useActionState<CreatePlanState, FormData>(createStrategicPlan, null);

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
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <CalendarRange size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("formHeading")}</h3>
            <span>{t("formSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("nameArLabel")}</label>
            <input type="text" name="nameAr" required dir="rtl" placeholder={t("nameArPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("nameEnLabel")}</label>
            <input type="text" name="nameEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("nameEnPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("startYearLabel")}</label>
            <input type="number" name="startYear" required min="2000" max="2200" step="1" dir="ltr" placeholder="2026" />
          </div>
          <div className="sru-field">
            <label>{t("endYearLabel")}</label>
            <input type="number" name="endYear" required min="2000" max="2200" step="1" dir="ltr" placeholder="2030" />
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
