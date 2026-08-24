"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importJobTitlesExcel, type JobTitlesImportResult } from "@/app/[locale]/(app)/career-path/job-titles/import-actions";
import { JOB_TITLE_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/**
 * Job-titles import, on the shared dialog (2026-08-24).
 *
 * The competency columns are deliberately NOT listed as mappable fields: this
 * sheet carries one optional column per institutional competency, named after
 * the competency itself, and they are resolved by name inside the action. The
 * dialog leaves them alone (an unmentioned column keeps its own header), so
 * they keep working exactly as before.
 */
export function ImportJobTitlesExcelForm() {
  const t = useTranslations("CareerPathJobTitlesPage");

  const fields: ImportFieldSpec[] = [
    // Name + family together identify a title (job_titles is unique on the pair).
    { key: "nameAr", label: t("importFieldNameAr"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.nameAr, isKey: true },
    { key: "jobFamily", label: t("importFieldJobFamily"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.jobFamily, isKey: true },
    { key: "gradeLevel", label: t("importFieldGrade"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.gradeLevel },
    { key: "category", label: t("importFieldCategory"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.category },
    { key: "nameEn", label: t("importFieldNameEn"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.nameEn },
    { key: "qualification", label: t("importFieldQualification"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.qualification },
    { key: "description", label: t("importFieldDescription"), columnLabel: JOB_TITLE_IMPORT_COLUMNS.description },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      templateHref="/templates/sru-job-titles-import-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importJobTitlesExcel}
      pendingLabel={t("importing")}
    >
      {(state: JobTitlesImportResult | null) => <JobTitlesImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function JobTitlesImportOutcome({ state }: { state: JobTitlesImportResult | null }) {
  const t = useTranslations("CareerPathJobTitlesPage");
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
        {t("importSuccess", {
          created: state.summary.created,
          updated: state.summary.updated,
          competencies: state.summary.competenciesSet,
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
