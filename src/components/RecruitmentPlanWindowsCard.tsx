"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CalendarClock } from "lucide-react";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { formatDateDmy } from "@/lib/dateParts";
import {
  intakeWindowLabels,
  intakeWindowState,
  planPeriodLabels,
  planPeriodState,
} from "@/lib/recruitmentPlanWindows";
import {
  updateRecruitmentPlanWindows,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  not_found: "errorNotFound",
  // صار بلوغه ممكنًا حين تبعت السنةُ بدايةَ الفترة: نقلُ فترة خطة إلى سنة
  // تشغلها خطة أخرى يصطدم بالفهرس الفريد. ظهر حيًّا بوصفه «خطأ غير متوقع»
  // لأن هذه الخريطة لم تكن تعرفه، فلم يفهم القارئ ما المانع.
  duplicate: "errorDuplicateYear",
  unknown: "errorUnknown",
};

/**
 * زمن الخطة: نافذة استقبال الطلبات، وفترة الخطة.
 *
 * قابل للتحرير هنا لا في نموذج الإنشاء وحده، لأن خطة 2027 القائمة أُنشئت قبل
 * وجود هذه الأعمدة، ولأن تصحيح تاريخٍ أُدخل خطأً حاجةٌ دائمة.
 *
 * الحالتان المعروضتان («الاستقبال مفتوح»، «جارية»…) مشتقّتان من التاريخين
 * ومن اليوم، لا مخزّنتان — فلا يوجد عمودُ حالةٍ ينحرف عن تاريخيه. أما وسم
 * الطلب «خارج الخطة» فمخزَّن، لأنه وصفٌ للحظة رفعه لا للحاضر.
 *
 * `today` يأتي من الخادم بتوقيت العرض المضبوط في النظام: حسابه في المتصفح
 * يعطي قيمة تختلف بين رسم الخادم ورسم العميل (hydration mismatch)، ويقيس
 * بتوقيت جهاز الزائر لا بتوقيت المنظمة.
 *
 * التنسيق يجري هنا بـ `formatDateDmy` المستوردة مباشرةً، لا بدالةٍ تُمرَّر
 * خاصيّةً من الخادم: الدوال لا تعبر حدّ مكوّنات الخادم إلى العميل (عدا
 * Server Actions)، فتمريرها كان سيفشل وقت التشغيل لا وقت الترجمة.
 */
export function RecruitmentPlanWindowsCard({
  planId,
  today,
  locale,
  canEdit,
  initial,
}: {
  planId: string;
  today: string;
  locale: string;
  canEdit: boolean;
  initial: {
    requestsOpenAt: string | null;
    requestsCloseAt: string | null;
    planStartDate: string | null;
    planEndDate: string | null;
  };
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const formatDate = (iso: string) => formatDateDmy(iso, locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);

  const [openAt, setOpenAt] = useState(initial.requestsOpenAt ?? "");
  const [closeAt, setCloseAt] = useState(initial.requestsCloseAt ?? "");
  const [startDate, setStartDate] = useState(initial.planStartDate ?? "");
  const [endDate, setEndDate] = useState(initial.planEndDate ?? "");

  // خطُّ الأساس هو آخر ما حُفظ فعلًا، لا الخاصيّة الواردة: React يبقي حالة
  // المكوّن عبر `router.refresh()`، فمقارنةُ الخاصيّة كانت ستُبقي الزر مفعّلًا
  // بعد حفظٍ ناجح. نفس ما استقرّ عليه `FinanceReviewPanel`.
  const [saved, setSaved] = useState({
    openAt: initial.requestsOpenAt ?? "",
    closeAt: initial.requestsCloseAt ?? "",
    startDate: initial.planStartDate ?? "",
    endDate: initial.planEndDate ?? "",
  });

  const intakeReversed = openAt !== "" && closeAt !== "" && closeAt < openAt;
  const periodReversed = startDate !== "" && endDate !== "" && endDate < startDate;
  const dirty =
    openAt !== saved.openAt ||
    closeAt !== saved.closeAt ||
    startDate !== saved.startDate ||
    endDate !== saved.endDate;

  const intake = intakeWindowState(openAt || null, closeAt || null, today);
  const period = planPeriodState(startDate || null, endDate || null, today);

  function range(from: string, to: string) {
    if (from === "" && to === "") return t("windowsNotSet");
    if (from !== "" && to !== "") return `${formatDate(from)} — ${formatDate(to)}`;
    return from !== "" ? `من ${formatDate(from)}` : `حتى ${formatDate(to)}`;
  }

  function save() {
    startTransition(async () => {
      const result = await updateRecruitmentPlanWindows({
        planId,
        requestsOpenAt: openAt,
        requestsCloseAt: closeAt,
        planStartDate: startDate,
        planEndDate: endDate,
      });
      setState(result);
      if (result.status === "success") {
        setSaved({ openAt, closeAt, startDate, endDate });
        router.refresh();
      }
    });
  }

  return (
    <section className="sru-card" style={{ marginBottom: 18 }}>
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <CalendarClock size={16} aria-hidden />
        </span>
        <h2 style={{ flex: 1 }}>{t("windowsHeading")}</h2>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 14 }}>
        <div>
          <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("windowsIntakeLabel")}</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{range(openAt, closeAt)}</div>
          <span className="pill">{intakeWindowLabels[intake]}</span>
        </div>
        <div>
          <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("windowsPeriodLabel")}</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{range(startDate, endDate)}</div>
          <span className="pill">{planPeriodLabels[period]}</span>
        </div>
      </div>

      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 14 }}>{t("windowsEditHint")}</p>

      {!canEdit ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("windowsReadOnly")}</p>
      ) : (
        <>
          <div className="sru-formgrid">
            <label className="sru-field">
              <span>{t("fieldRequestsOpenAt")}</span>
              <DateFieldDmy value={openAt} onChange={setOpenAt} ariaLabel={t("fieldRequestsOpenAt")} />
            </label>
            <label className="sru-field">
              <span>{t("fieldRequestsCloseAt")}</span>
              <DateFieldDmy value={closeAt} onChange={setCloseAt} ariaLabel={t("fieldRequestsCloseAt")} />
            </label>
            <label className="sru-field">
              <span>{t("fieldPlanStartDate")}</span>
              <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("fieldPlanStartDate")} />
            </label>
            <label className="sru-field">
              <span>{t("fieldPlanEndDate")}</span>
              <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("fieldPlanEndDate")} />
            </label>
          </div>

          <div className="sru-form-submitrow">
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-sm"
              disabled={pending || !dirty || intakeReversed || periodReversed}
              onClick={save}
            >
              {t("windowsSaveButton")}
            </button>
            {(intakeReversed || periodReversed) && (
              <span role="alert" className="text-sm text-red-600">
                {t(intakeReversed ? "errorIntakeWindowReversed" : "errorPlanPeriodReversed")}
              </span>
            )}
            {state?.status === "success" && (
              <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("windowsSaved")}</span>
            )}
            {state?.status === "error" && (
              <span role="alert" className="text-sm text-red-600">
                {t(errorKeys[state.message] ?? "errorUnknown")}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
