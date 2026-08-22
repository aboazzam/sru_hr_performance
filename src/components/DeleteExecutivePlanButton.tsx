"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteExecutivePlan, type CreateExecutivePlanState } from "@/app/[locale]/(app)/executive-plans/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * Same two-step shape as the strategic plan's delete — a warning, then the
 * plan's own name typed out — because the request was to make this screen
 * behave like that one.
 *
 * The WORDING is not the same, and that is the point: nothing in the schema
 * references `executive_plans`, so there is no cascade here. An executive
 * plan is a window onto the strategic plan's targets and initiatives, which
 * keep belonging to that plan. Copying the strategic warning would promise a
 * deletion that does not happen.
 */
export function DeleteExecutivePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const t = useTranslations("ExecutivePlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<CreateExecutivePlanState, FormData>(deleteExecutivePlan, null);
  const [handled, setHandled] = useState<CreateExecutivePlanState>(null);

  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") {
      setStep(1);
      setTyped("");
    }
  }

  useEffect(() => {
    if (state?.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  const nameMatches = typed.trim() === planName.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(1);
          setTyped("");
          dialogRef.current?.showModal();
        }}
        className="sru-icon-action"
        title={t("deleteButton")}
        aria-label={t("deleteButton")}
      >
        <Trash2 size={15} aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="sru-danger-head">
          <span className="sru-danger-icon" aria-hidden>
            <AlertTriangle size={22} />
          </span>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t("deleteHeading")}</h3>
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 2 }}>{planName}</p>
          </div>
        </div>

        {step === 1 ? (
          <>
            <p className="sru-danger-note">{t("deleteWarning")}</p>
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 10 }}>{t("deleteKeepsNote")}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" className="sru-btn sru-btn-danger" onClick={() => setStep(2)}>
                {t("deleteContinue")}
              </button>
              <button type="button" className="sru-btn" onClick={() => dialogRef.current?.close()}>
                {t("deleteCancel")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sru-danger-note">{t("deleteConfirmTypeNote", { name: planName })}</p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              dir="rtl"
              aria-label={t("deleteConfirmTypeNote", { name: planName })}
              style={{ width: "100%", marginTop: 8 }}
            />
            {state?.status === "error" && (
              <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
                {t(errorKeys[state.message] ?? "errorUnknown")}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                disabled={!nameMatches || pending}
                className="sru-btn sru-btn-danger"
                onClick={() => {
                  const formData = new FormData();
                  formData.set("planId", planId);
                  startTransition(() => formAction(formData));
                }}
              >
                {pending ? t("deleteSubmitting") : t("deleteConfirmFinal")}
              </button>
              <button type="button" className="sru-btn" onClick={() => setStep(1)}>
                {t("deleteBack")}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
