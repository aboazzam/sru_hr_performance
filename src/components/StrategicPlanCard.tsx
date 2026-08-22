"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowLeft, Eye, Pencil } from "lucide-react";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import { initiativeProgress } from "@/lib/initiativeProgress";
import { DeleteStrategicPlanButton } from "@/components/DeleteStrategicPlanButton";
import { updateStrategicPlan, type CreatePlanState } from "@/app/[locale]/(app)/kpis/plans/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export interface StrategicPlanCardData {
  id: string;
  nameAr: string;
  nameEn: string | null;
  startYear: number;
  endYear: number;
  goalCount: number;
  initiativeCount: number;
  programCount: number;
}

/**
 * One plan, shaped like the initiative and program cards (2026-08-22).
 *
 * The ring reuses the same helper those two use. A plan stores only its year
 * range, so the honest number is how much of that range has passed — the case
 * that helper labels as elapsed time rather than as completion. The range is
 * widened to whole years (1 Jan of the first, 31 Dec of the last), which is
 * what "خطة 2024–2030" actually means.
 */
export function StrategicPlanCard({
  plan,
  canManage,
  todayIso,
}: {
  plan: StrategicPlanCardData;
  canManage: boolean;
  todayIso: string;
}) {
  const t = useTranslations("StrategicPlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<CreatePlanState, FormData>(updateStrategicPlan, null);
  const [handled, setHandled] = useState<CreatePlanState>(null);

  if (state !== handled) setHandled(state);

  useEffect(() => {
    if (state?.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const href = `/kpis/plans/${plan.id}`;
  const progress = initiativeProgress(
    { startDate: `${plan.startYear}-01-01`, endDate: `${plan.endYear}-12-31` },
    todayIso
  );

  return (
    <div className="sru-card sru-initiative-card">
      <div className="sru-initiative-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700 }}>
            <Link href={href} className="sru-stretched sru-initiative-card-title">
              {plan.nameAr}
              <ArrowLeft size={14} aria-hidden className="sru-initiative-card-go" />
            </Link>
          </h4>
          {plan.nameEn && <span className="sru-name-en">{plan.nameEn}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span className="sru-initiative-chip is-plain" dir="ltr">
              {plan.startYear}–{plan.endYear}
            </span>
            <span className="sru-initiative-chip is-plain">{t("chipGoals", { count: plan.goalCount })}</span>
            <span className="sru-initiative-chip is-plain">{t("chipInitiatives", { count: plan.initiativeCount })}</span>
            <span className="sru-initiative-chip is-plain">{t("chipPrograms", { count: plan.programCount })}</span>
          </div>
        </div>
        {/* After the text, so in an RTL row it renders on the LEFT. */}
        <InitiativeProgressRing progress={progress} />
        <div className="sru-initiative-card-actions">
          <Link href={href} className="sru-icon-action" title={t("viewButton")} aria-label={t("viewButton")}>
            <Eye size={15} aria-hidden />
          </Link>
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => dialogRef.current?.showModal()}
                className="sru-icon-action"
                title={t("editButton")}
                aria-label={t("editButton")}
              >
                <Pencil size={15} aria-hidden />
              </button>
              <DeleteStrategicPlanButton planId={plan.id} planName={plan.nameAr} />
            </>
          )}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t("editHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <input type="hidden" name="planId" value={plan.id} />
          <div className="sru-formgrid">
            <div className="sru-field">
              <label>{t("nameArLabel")}</label>
              <input type="text" name="nameAr" required dir="rtl" defaultValue={plan.nameAr} />
            </div>
            <div className="sru-field">
              <label>{t("nameEnLabel")}</label>
              <input type="text" name="nameEn" dir="ltr" style={{ textAlign: "left" }} defaultValue={plan.nameEn ?? ""} />
            </div>
            <div className="sru-field">
              <label>{t("startYearLabel")}</label>
              <input type="number" name="startYear" required min={2000} max={2200} defaultValue={plan.startYear} />
            </div>
            <div className="sru-field">
              <label>{t("endYearLabel")}</label>
              <input type="number" name="endYear" required min={2000} max={2200} defaultValue={plan.endYear} />
            </div>
          </div>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error">
              <AlertCircle size={15} aria-hidden />
              {t(errorKeys[state.message] ?? "errorUnknown")}
            </p>
          )}

          <div className="sru-form-submitrow">
            <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
              {pending ? t("savingButton") : t("saveButton")}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
