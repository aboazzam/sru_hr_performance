"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CalendarRange, Plus } from "lucide-react";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import {
  createRecruitmentPlan,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicateYear",
  unknown: "errorUnknown",
};

/**
 * "خطة توظيف جديدة" — a button that opens the form, not a form that is always
 * open. Asked for directly: the create panel sat permanently above the list,
 * so the page led with a form for something done a few times a year and
 * pushed the plans themselves — the reason to visit — below the fold.
 *
 * Native `<dialog>`, the same modal this project already uses for the Excel
 * import: Escape-to-close and a real backdrop come for free rather than being
 * re-implemented, and a click on the backdrop closes it.
 *
 * The form clears and the dialog closes on success, so the next "new plan"
 * starts empty instead of showing the previous one's text.
 */
export function CreateRecruitmentPlanForm() {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);
  const [nameAr, setNameAr] = useState("");
  const [notes, setNotes] = useState("");
  // زمنان مستقلان: نافذة استقبال الطلبات، ثم فترة الخطة نفسها. كلاهما
  // اختياري — خطةٌ تُنشأ اليوم قد لا تكون نافذتها قد تقرّرت بعد.
  const [requestsOpenAt, setRequestsOpenAt] = useState("");
  const [requestsCloseAt, setRequestsCloseAt] = useState("");
  const [planStartDate, setPlanStartDate] = useState("");
  const [planEndDate, setPlanEndDate] = useState("");

  // مدًى مقلوب يرفضه الخادم وقاعدة البيانات؛ يُقال هنا قبل الإرسال لأن
  // «تعذّر إتمام العملية» بعد الضغط لا يدلّ على الحقل الذي أخطأ.
  const intakeReversed =
    requestsOpenAt !== "" && requestsCloseAt !== "" && requestsCloseAt < requestsOpenAt;
  const periodReversed =
    planStartDate !== "" && planEndDate !== "" && planEndDate < planStartDate;

  function open() {
    // A failure message from a previous attempt must not greet the next one.
    setState(null);
    dialogRef.current?.showModal();
  }

  function submit() {
    startTransition(async () => {
      // لا سنة تُرسَل: الخادم يشتقّها من بداية الفترة.
      const result = await createRecruitmentPlan(nameAr, notes, {
        requestsOpenAt,
        requestsCloseAt,
        planStartDate,
        planEndDate,
      });
      setState(result);
      if (result.status === "success") {
        setNameAr("");
        setNotes("");
        setRequestsOpenAt("");
        setRequestsCloseAt("");
        setPlanStartDate("");
        setPlanEndDate("");
        dialogRef.current?.close();
        router.refresh();
      }
    });
  }

  return (
    <>
      <button type="button" className="sru-btn sru-btn-primary" onClick={open}>
        <Plus size={15} aria-hidden style={{ verticalAlign: "-2px", marginLeft: 4 }} />
        {t("newPlanHeading")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <CalendarRange size={16} aria-hidden />
          </span>
          <h2 style={{ flex: 1 }}>{t("newPlanHeading")}</h2>
          <button
            type="button"
            className="sru-modal-close"
            onClick={() => dialogRef.current?.close()}
            aria-label={t("closeButton")}
          >
            ×
          </button>
        </div>

        <div className="sru-formgrid">
          <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <span>{t("fieldPlanName")}</span>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
          </label>

          <label className="sru-field">
            <span>{t("fieldRequestsOpenAt")}</span>
            <DateFieldDmy value={requestsOpenAt} onChange={setRequestsOpenAt} ariaLabel={t("fieldRequestsOpenAt")} />
          </label>
          <label className="sru-field">
            <span>{t("fieldRequestsCloseAt")}</span>
            <DateFieldDmy value={requestsCloseAt} onChange={setRequestsCloseAt} ariaLabel={t("fieldRequestsCloseAt")} />
          </label>
          <label className="sru-field">
            <span>{t("fieldPlanStartDateRequired")}</span>
            <DateFieldDmy value={planStartDate} onChange={setPlanStartDate} ariaLabel={t("fieldPlanStartDate")} />
          </label>
          <label className="sru-field">
            <span>{t("fieldPlanEndDate")}</span>
            <DateFieldDmy value={planEndDate} onChange={setPlanEndDate} ariaLabel={t("fieldPlanEndDate")} />
          </label>
          <label className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <span>{t("fieldNotes")}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {planStartDate === "" && (
            <p style={{ gridColumn: "1 / -1", margin: 0, color: "var(--sru-muted)", fontSize: 12 }}>
              {t("planStartRequiredHint")}
            </p>
          )}
          {(intakeReversed || periodReversed) && (
            <p role="alert" className="text-sm text-red-600" style={{ gridColumn: "1 / -1", margin: 0 }}>
              {t(intakeReversed ? "errorIntakeWindowReversed" : "errorPlanPeriodReversed")}
            </p>
          )}
        </div>

        <div className="sru-form-submitrow">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={pending || nameAr.trim() === "" || planStartDate === "" || intakeReversed || periodReversed}
            onClick={submit}
          >
            {pending ? t("creating") : t("createPlanButton")}
          </button>
          <button type="button" className="sru-btn" disabled={pending} onClick={() => dialogRef.current?.close()}>
            {t("cancelButton")}
          </button>
          {/* Errors stay INSIDE the dialog: the success path closes it, so a
              message shown behind it would never be read. */}
          {state?.status === "error" && (
            <span role="alert" className="text-sm text-red-600">
              {t(errorKeys[state.message] ?? "errorUnknown")}
            </span>
          )}
        </div>
      </dialog>
    </>
  );
}
