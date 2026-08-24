"use client";

import { useActionState, useEffect, useRef, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createStrategicPlan, type CreatePlanState } from "@/app/[locale]/(app)/kpis/plans/actions";

type ErrorMessage = Extract<CreatePlanState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * Compact trigger button opening a <dialog> modal (2026-08-19 request:
 * "احذف هذا النموذج ولنكتفي بزر إضافة خطة جديدة" -- the always-visible
 * four-field card sat under the plans table taking permanent page height
 * for an occasional action). Same pattern already established by
 * AddOrgStructureLevelForm / ImportOrgStructureExcelForm: the dialog
 * closes on success and the refreshed table IS the confirmation, so no
 * success banner is rendered behind a closed dialog; errors keep the
 * dialog open and are shown inside it.
 */
export function NewStrategicPlanForm() {
  const t = useTranslations("StrategicPlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CreatePlanState, FormData>(createStrategicPlan, null);

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike -- so
  // submission is intercepted, and the reset below happens only on success.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn sru-btn-primary">
        <Plus size={15} aria-hidden />
        {t("addPlanTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("formHeading")}</h3>
            <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("formSubtitle")}</span>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} style={{ marginTop: 14 }}>
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
      </dialog>
    </>
  );
}
