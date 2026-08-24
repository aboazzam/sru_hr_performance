"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteStrategicPlan, type DeletePlanState } from "@/app/[locale]/(app)/kpis/plans/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * Deleting a plan takes everything under it — goals, sub-goals, KPIs, annual
 * targets, assigned targets, initiatives and their activities/assignments,
 * programs and their committees, and the executive plans built on it. That is
 * far too much to hang off a single `window.confirm`, so this asks TWICE and
 * makes the second answer impossible to give by reflex (2026-08-22 request:
 * "رسالة تحذير بعلامة تحذير قوية … والتأكيد مرتين وليست مرة واحدة"):
 *
 *   1. a warning listing what will go,
 *   2. typing the plan's own name — a step you cannot pass without reading
 *      which plan you are on.
 *
 * The one thing the warning does NOT claim is the vision, mission and values:
 * those are university-wide rows with no plan_id, and the copy says they stay.
 */
export function DeleteStrategicPlanButton({ planId, planName }: { planId: string; planName: string }) {
  const t = useTranslations("StrategicPlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState<DeletePlanState, FormData>(deleteStrategicPlan, null);
  const [handled, setHandled] = useState<DeletePlanState>(null);

  // State is reset during render (this repo forbids setState inside an
  // effect); the dialog itself is a DOM node, so closing it belongs in the
  // effect instead — touching a ref during render is its own lint error.
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

  function open() {
    setStep(1);
    setTyped("");
    dialogRef.current?.showModal();
  }

  const nameMatches = typed.trim() === planName.trim();

  return (
    <>
      <button type="button" onClick={open} className="sru-icon-action" title={t("deleteButton")} aria-label={t("deleteButton")}>
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
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("deleteHeading")}</h3>
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 2 }}>{planName}</p>
          </div>
        </div>

        {step === 1 ? (
          <>
            <p className="sru-danger-note">{t("deleteWarning")}</p>
            <ul className="sru-danger-list">
              {["goals", "kpis", "targets", "initiatives", "programs", "executivePlans"].map((key) => (
                <li key={key}>{t(`deleteItem.${key}`)}</li>
              ))}
            </ul>
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 10 }}>{t("deleteKeepsNote")}</p>
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
