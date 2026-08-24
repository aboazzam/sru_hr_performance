"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importVacanciesExcel, type VacanciesImportResult } from "@/app/[locale]/(app)/vacancies/import-actions";
import { VACANCY_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/**
 * Vacancies import, on the shared dialog (2026-08-24): the mode choice, the
 * column mapping and the field selection all come from `ExcelImportDialog`, so
 * this file only declares what a vacancy's fields are and how to render the
 * importer's own result.
 */
export function ImportVacanciesExcelForm() {
  const t = useTranslations("VacanciesPage");

  const fields: ImportFieldSpec[] = [
    // The two that identify the posting; a row without them cannot be placed.
    { key: "jobTitle", label: t("importFieldJobTitle"), columnLabel: VACANCY_IMPORT_COLUMNS.jobTitle, isKey: true },
    { key: "orgUnit", label: t("importFieldOrgUnit"), columnLabel: VACANCY_IMPORT_COLUMNS.orgUnit, isKey: true },
    { key: "jobFamily", label: t("importFieldJobFamily"), columnLabel: VACANCY_IMPORT_COLUMNS.jobFamily },
    { key: "status", label: t("importFieldStatus"), columnLabel: VACANCY_IMPORT_COLUMNS.status },
    { key: "requirements", label: t("importFieldRequirements"), columnLabel: VACANCY_IMPORT_COLUMNS.requirements },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      templateHref="/templates/sru-vacancies-import-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importVacanciesExcel}
      pendingLabel={t("importing")}
    >
      {(state: VacanciesImportResult | null) => <VacanciesImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function VacanciesImportOutcome({ state }: { state: VacanciesImportResult | null }) {
  const t = useTranslations("VacanciesPage");
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
