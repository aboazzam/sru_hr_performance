"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Flag } from "lucide-react";
import { createStrategicGoal, type CreateStrategicGoalState } from "@/app/[locale]/(app)/kpis/strategic-goals/new/actions";
import type { Locale } from "@/i18n/config";

interface PlanOption {
  id: string;
  name_ar: string;
  start_year: number;
  end_year: number;
}

type ErrorMessage = Extract<CreateStrategicGoalState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  identity_incomplete: "errorIdentityIncomplete",
  unknown: "errorUnknown",
};

export function NewStrategicGoalForm({ locale, plans }: { locale: Locale; plans: PlanOption[] }) {
  const t = useTranslations("NewStrategicGoalPage");
  const [state, formAction, pending] = useActionState<CreateStrategicGoalState, FormData>(
    createStrategicGoal.bind(null, locale),
    null
  );

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
            <Flag size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("sectionGoalTitle")}</h3>
            <span>{t("sectionGoalSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("planLabel")}</label>
            <select name="planId" required defaultValue="">
              <option value="" disabled>
                {t("planPlaceholder")}
              </option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name_ar} ({plan.start_year}–{plan.end_year})
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("titleLabel")}</label>
            <input type="text" name="titleAr" required dir="rtl" placeholder={t("titlePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("titleEnLabel")}</label>
            <input type="text" name="titleEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("titleEnPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("weightLabel")}</label>
            <input type="text" inputMode="decimal" name="weight" min="0.01" max="100" step="0.01" placeholder={t("weightPlaceholder")} />
          </div>
        </div>
        <div className="sru-field">
          <label>{t("descriptionLabel")}</label>
          <textarea name="descriptionAr" dir="rtl" rows={3} placeholder={t("descriptionPlaceholder")} />
        </div>
        <div className="sru-field">
          <label>{t("descriptionEnLabel")}</label>
          <textarea
            name="descriptionEn"
            dir="ltr"
            rows={3}
            style={{ textAlign: "left" }}
            placeholder={t("descriptionEnPlaceholder")}
          />
        </div>
      </section>



      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[state.message])}
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
