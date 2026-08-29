"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importCompetenciesExcel, type CompetenciesImportResult } from "@/app/[locale]/(app)/competencies/import-actions";
import { COMPETENCY_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/** Competency-framework import, on the shared dialog (2026-08-29 request: "اضف زر الاستيراد وكذلك بنفس الخيارات"). */
export function ImportCompetenciesExcelForm() {
  const t = useTranslations("CompetenciesPage");

  const fields: ImportFieldSpec[] = [
    // The four together identify the row -- without them there is no
    // domain to file the competency under and no classification to give it.
    { key: "pillar", label: t("exportColumnPillar"), columnLabel: COMPETENCY_IMPORT_COLUMNS.pillar, isKey: true },
    { key: "domain", label: t("exportColumnDomain"), columnLabel: COMPETENCY_IMPORT_COLUMNS.domain, isKey: true },
    { key: "nameAr", label: t("competencyNameArLabel"), columnLabel: COMPETENCY_IMPORT_COLUMNS.nameAr, isKey: true },
    { key: "classification", label: t("competencyClassificationLabel"), columnLabel: COMPETENCY_IMPORT_COLUMNS.classification, isKey: true },
    { key: "jobFamily", label: t("jobFamilyLabel"), columnLabel: COMPETENCY_IMPORT_COLUMNS.jobFamily },
    { key: "definition", label: t("definitionArLabel"), columnLabel: COMPETENCY_IMPORT_COLUMNS.definition },
    { key: "expectedImpact", label: t("expectedImpactArLabel"), columnLabel: COMPETENCY_IMPORT_COLUMNS.expectedImpact },
    { key: "basic", label: t("importFieldBasic"), columnLabel: COMPETENCY_IMPORT_COLUMNS.basic },
    { key: "practitioner", label: t("importFieldPractitioner"), columnLabel: COMPETENCY_IMPORT_COLUMNS.practitioner },
    { key: "advanced", label: t("importFieldAdvanced"), columnLabel: COMPETENCY_IMPORT_COLUMNS.advanced },
    { key: "professional", label: t("importFieldProfessional"), columnLabel: COMPETENCY_IMPORT_COLUMNS.professional },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      templateHref="/templates/sru-competencies-import-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importCompetenciesExcel}
      pendingLabel={t("importing")}
      triggerVariant="primary"
    >
      {(state: CompetenciesImportResult | null) => <CompetenciesImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function CompetenciesImportOutcome({ state }: { state: CompetenciesImportResult | null }) {
  const t = useTranslations("CompetenciesPage");
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
        {t("importSuccess", { created: state.summary.created, updated: state.summary.updated })}
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
