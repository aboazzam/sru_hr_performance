"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CalendarRange, Plus } from "lucide-react";
import { createExecutivePlan, type CreateExecutivePlanState } from "@/app/[locale]/(app)/executive-plans/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { computeEndDate, describeCycleDuration } from "@/lib/cyclePeriod";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * Create-plan modal, deliberately shaped like the strategic-plan one ("انشاء
 * الخطة شبيه بانشاء خطة استاتيجية") but for a PERIOD rather than a year
 * range.
 *
 * The period is the user's choice, with the common case made the default
 * (2026-08-20: "دع المستخدم يختار النطاق والأغلب سنة واحدة مربوطة بدورة
 * تقييم"): picking an evaluation cycle fills the name and both dates from
 * that cycle, and picking a start date alone fills a one-year window — both
 * remain fully editable afterwards, and a plan with no cycle at all is
 * valid, which matters because production has no cycles yet.
 */
export function NewExecutivePlanForm({
  strategicPlans,
  cycles,
}: {
  strategicPlans: Array<{ id: string; nameAr: string }>;
  cycles: Array<{ id: string; nameAr: string; startDate: string; endDate: string }>;
}) {
  const t = useTranslations("ExecutivePlansPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [cycleId, setCycleId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [state, formAction, pending] = useActionState<CreateExecutivePlanState, FormData>(createExecutivePlan, null);
  const [handled, setHandled] = useState<CreateExecutivePlanState>(null);

  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") {
      setCycleId("");
      setStartDate("");
      setEndDate("");
      setNameAr("");
    }
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function chooseCycle(nextCycleId: string) {
    setCycleId(nextCycleId);
    const cycle = cycles.find((c) => c.id === nextCycleId);
    if (!cycle) return;
    setStartDate(cycle.startDate);
    setEndDate(cycle.endDate);
    if (nameAr.trim() === "") setNameAr(cycle.nameAr);
  }

  function chooseStartDate(next: string) {
    setStartDate(next);
    // Default the window to one year — the common case — without locking it:
    // the end date stays editable, and an existing end date is left alone.
    if (next !== "" && endDate === "") {
      const oneYear = computeEndDate(next, 12);
      if (oneYear) setEndDate(oneYear);
    }
  }

  // describeCycleDuration returns null for an unparsable or non-increasing
  // range -- the same condition executive_plans_dates_valid enforces in
  // Postgres, so one call answers both questions.
  const span = describeCycleDuration(startDate, endDate);
  const invalidRange = startDate !== "" && endDate !== "" && span === null;

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
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t("formHeading")}</h3>
            <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("formSubtitle")}</span>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <section className="sru-formsection">
            <div className="sru-formsection-head">
              <span className="sru-formsection-badge">
                <CalendarRange size={17} aria-hidden />
              </span>
              <div>
                <h3>{t("periodHeading")}</h3>
                <span>{t("periodSubtitle")}</span>
              </div>
            </div>
            <div className="sru-formgrid">
              <input type="hidden" name="startDate" value={startDate} />
              <input type="hidden" name="endDate" value={endDate} />
              <div className="sru-field">
                <label>{t("strategicPlanLabel")}</label>
                <select name="strategicPlanId" required defaultValue={strategicPlans[0]?.id ?? ""}>
                  {strategicPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sru-field">
                <label>{t("cycleLabel")}</label>
                <select name="cycleId" value={cycleId} onChange={(e) => chooseCycle(e.target.value)}>
                  <option value="">{cycles.length === 0 ? t("cycleNoneAvailable") : t("cycleNone")}</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sru-field">
                <label>{t("nameArLabel")}</label>
                <input type="text" name="nameAr" required dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
              </div>
              <div className="sru-field">
                <label>{t("nameEnLabel")}</label>
                <input type="text" name="nameEn" dir="ltr" style={{ textAlign: "left" }} />
              </div>
              <div className="sru-field">
                <label>{t("startDateLabel")}</label>
                <DateFieldDmy value={startDate} onChange={chooseStartDate} />
              </div>
              <div className="sru-field">
                <label>{t("endDateLabel")}</label>
                <DateFieldDmy value={endDate} onChange={setEndDate} />
              </div>
            </div>
            {span && (
              <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8 }}>
                {span.months != null
                  ? t("periodSummaryMonths", { months: span.months, days: span.days })
                  : t("periodSummaryDays", { days: span.days })}
              </p>
            )}
            {invalidRange && (
              <p role="alert" style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12, marginTop: 8 }}>
                {t("errorRange")}
              </p>
            )}
          </section>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error">
              <AlertCircle size={15} aria-hidden />
              {t(errorKeys[state.message] ?? "errorUnknown")}
            </p>
          )}

          <div className="sru-form-submitrow">
            <button
              type="submit"
              disabled={pending || startDate === "" || endDate === "" || invalidRange}
              className="sru-btn sru-btn-primary"
            >
              {pending ? t("submitting") : t("submit")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
