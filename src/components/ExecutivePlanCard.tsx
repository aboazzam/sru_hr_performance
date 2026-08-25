"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowLeft, Eye, Pencil } from "lucide-react";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import { initiativeProgress } from "@/lib/initiativeProgress";
import { planAchievement, type PlanAchievementInitiative } from "@/lib/planAchievement";
import { DeleteExecutivePlanButton } from "@/components/DeleteExecutivePlanButton";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { updateExecutivePlan, type CreateExecutivePlanState } from "@/app/[locale]/(app)/operational-plans/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export interface ExecutivePlanCardData {
  id: string;
  nameAr: string;
  nameEn: string | null;
  strategicPlanId: string;
  strategicPlanName: string;
  cycleId: string | null;
  cycleName: string | null;
  startDate: string;
  endDate: string;
  status: string;
  statusLabel: string;
  periodLabel: string;
  /** Initiatives of the strategic plan that fall inside THIS plan's window. */
  initiatives: PlanAchievementInitiative[];
}

/**
 * One executive plan, shaped like the strategic-plan card it was asked to
 * match: time as a bar across the top, achievement in the ring.
 *
 * The two numbers come from different places on purpose. The bar reads this
 * plan's own start/end dates. The ring reads the initiatives that fall inside
 * that window — an executive plan owns no progress of its own, it is a window
 * onto the strategic plan's work, so its achievement IS that work's.
 */
export function ExecutivePlanCard({
  plan,
  canManage,
  todayIso,
  strategicPlans,
  cycles,
}: {
  plan: ExecutivePlanCardData;
  canManage: boolean;
  todayIso: string;
  strategicPlans: Array<{ id: string; nameAr: string }>;
  cycles: Array<{ id: string; nameAr: string }>;
}) {
  const t = useTranslations("ExecutivePlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [startDate, setStartDate] = useState(plan.startDate);
  const [endDate, setEndDate] = useState(plan.endDate);
  const [state, formAction, pending] = useActionState<CreateExecutivePlanState, FormData>(updateExecutivePlan, null);
  const [handled, setHandled] = useState<CreateExecutivePlanState>(null);

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

  const href = `/operational-plans/${plan.id}`;
  const elapsed = initiativeProgress({ startDate: plan.startDate, endDate: plan.endDate }, todayIso);
  const achievement = planAchievement({ initiatives: plan.initiatives });
  const achievementCaption =
    achievement.kind === "none"
      ? t("achievementUnknown")
      : t("achievementFromInitiatives", { reported: achievement.reported, total: achievement.total });

  return (
    <div className="sru-card sru-initiative-card">
      <div className="sru-plan-timeline" title={t("timelineTitle")}>
        <div className="sru-plan-timeline-track" aria-hidden>
          <span className="sru-plan-timeline-fill" style={{ width: `${elapsed.percent}%` }} />
        </div>
        <span className="sru-plan-timeline-label">{t("timelineLabel", { percent: elapsed.percent })}</span>
      </div>

      <div className="sru-initiative-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 700 }}>
            <Link href={href} className="sru-stretched sru-initiative-card-title">
              {plan.nameAr}
              <ArrowLeft size={14} aria-hidden className="sru-initiative-card-go" />
            </Link>
          </h4>
          {plan.nameEn && <span className="sru-name-en">{plan.nameEn}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span className="sru-initiative-chip">{plan.statusLabel}</span>
            <span className="sru-initiative-chip is-plain">{plan.periodLabel}</span>
            <span className="sru-initiative-chip is-plain">{plan.strategicPlanName}</span>
            <span className="sru-initiative-chip is-plain">{plan.cycleName ?? t("cycleNone")}</span>
          </div>
        </div>
        {/* After the text, so in an RTL row it renders on the LEFT. */}
        <InitiativeProgressRing
          progress={{ percent: achievement.percent, kind: achievement.kind === "none" ? "none" : "reported" }}
          caption={achievementCaption}
        />
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
              <DeleteExecutivePlanButton planId={plan.id} planName={plan.nameAr} />
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
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("editHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="startDate" value={startDate} />
          <input type="hidden" name="endDate" value={endDate} />
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
              <label>{t("strategicPlanLabel")}</label>
              <select name="strategicPlanId" required defaultValue={plan.strategicPlanId}>
                {strategicPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="sru-field">
              <label>{t("cycleLabel")}</label>
              <select name="cycleId" defaultValue={plan.cycleId ?? ""}>
                <option value="">{t("cycleNone")}</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="sru-field">
              <label>{t("startDateLabel")}</label>
              <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("startDateLabel")} />
            </div>
            <div className="sru-field">
              <label>{t("endDateLabel")}</label>
              <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("endDateLabel")} />
            </div>
            <div className="sru-field">
              <label>{t("statusLabel")}</label>
              <input type="text" name="status" dir="rtl" defaultValue={plan.status} />
            </div>
          </div>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error">
              <AlertCircle size={15} aria-hidden />
              {t(errorKeys[state.message] ?? "errorUnknown")}
            </p>
          )}

          <div className="sru-form-submitrow">
            <button type="submit" disabled={pending || !startDate || !endDate} className="sru-btn sru-btn-primary">
              {pending ? t("savingButton") : t("saveButton")}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
