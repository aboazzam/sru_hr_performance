"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { createRecommendation, type CreateRecommendationState } from "@/app/[locale]/(app)/recommendations/actions";

interface EmployeeOption {
  id: string;
  employee_number: string;
  full_name_ar: string;
}
interface CycleOption {
  id: string;
  name_ar: string;
}

type ErrorMessage = Extract<CreateRecommendationState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CreateRecommendationForm({ employees, cycles }: { employees: EmployeeOption[]; cycles: CycleOption[] }) {
  const t = useTranslations("RecommendationsPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateRecommendationState, FormData>(createRecommendation, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

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
    <form method="post" ref={formRef} onSubmit={handleSubmit}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Sparkles size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("newRecommendationHeading")}</h3>
            <span>{t("formSectionSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("employeeLabel")}</label>
            <select name="employeeId" required defaultValue="">
              <option value="" disabled>
                {t("employeePlaceholder")}
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee_number} — {e.full_name_ar}
                </option>
              ))}
            </select>
          </div>

          <div className="sru-field">
            <label>{t("typeLabel")}</label>
            <select name="type" required defaultValue="">
              <option value="" disabled>
                {t("typePlaceholder")}
              </option>
              <option value="development">{t("typeDevelopment")}</option>
              <option value="separation">{t("typeSeparation")}</option>
            </select>
          </div>

          <div className="sru-field">
            <label>{t("cycleLabel")}</label>
            <select name="cycleId" defaultValue="">
              <option value="">{t("cyclePlaceholder")}</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar}
                </option>
              ))}
            </select>
          </div>

          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("reasoningLabel")}</label>
            <textarea name="reasoning" rows={3} dir="rtl" placeholder={t("reasoningPlaceholder")} />
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
