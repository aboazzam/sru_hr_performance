"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importPlanItemsExcel, type PlanItemsImportResult } from "@/app/[locale]/(app)/recruitment/plan/import-actions";
import { PLAN_ITEM_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  forbidden: "importErrorNotDraft",
  not_found: "importErrorNotFound",
  unknown: "importErrorUnknown",
};

/**
 * استيراد بنود الخطة من إكسل، على الحوار المشترك.
 *
 * الخيارات الثلاثة المعتادة تأتي منه لا من هنا: التحديث أم الإضافة فقط،
 * وتحميل نموذج فارغ، ومطابقة أعمدة الملف بحقول المنصة. فلا يبقى لهذا الملف
 * إلا تعريف الحقول وعرض نتيجة الاستيراد.
 */
export function ImportPlanItemsExcelForm({ planId }: { planId: string }) {
  const t = useTranslations("RecruitmentPlanPage");

  const fields: ImportFieldSpec[] = [
    // الوحدة والمسمى يعرّفان البند، فلا يُنزع اختيارهما.
    { key: "orgUnit", label: t("columnOrgUnit"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.orgUnit, isKey: true },
    { key: "jobTitle", label: t("columnJobTitle"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.jobTitle, isKey: true },
    { key: "jobFamily", label: t("importFieldJobFamily"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.jobFamily },
    { key: "headcount", label: t("columnHeadcount"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.headcount },
    { key: "targetQuarter", label: t("columnQuarter"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.targetQuarter },
    { key: "priority", label: t("columnPriority"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.priority },
    { key: "monthlyCost", label: t("columnMonthlyCost"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.monthlyCost },
    { key: "justification", label: t("importFieldJustification"), columnLabel: PLAN_ITEM_IMPORT_COLUMNS.justification },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importItemsTrigger")}
      heading={t("importItemsHeading")}
      subtitle={t("importItemsNote")}
      templateHref="/templates/sru-plan-items-import-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importPlanItemsExcel}
      pendingLabel={t("importing")}
      extraFields={{ planId }}
      triggerVariant="primary"
    >
      {(state: PlanItemsImportResult | null) => <PlanItemsImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function PlanItemsImportOutcome({ state }: { state: PlanItemsImportResult | null }) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  if (!state) return null;

  if (state.status === "error") {
    return (
      <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
        {t(errorMessageKeys[state.message] ?? "importErrorUnknown")}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 12, fontSize: 11.5 }}>
      <p role="status" style={{ color: "var(--sru-success, #15803d)", marginBottom: 8 }}>
        {t("importItemsSuccess", {
          created: state.summary.created,
          updated: state.summary.updated,
          skipped: state.summary.skipped,
        })}
      </p>
      {state.summary.rowErrors.length > 0 && (
        <details>
          <summary className="text-red-600">{t("importWarnings", { count: state.summary.rowErrors.length })}</summary>
          <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
            {state.summary.rowErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
