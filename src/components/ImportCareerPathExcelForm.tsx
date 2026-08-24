"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importCareerPathExcel, type CareerPathImportResult } from "@/app/[locale]/(app)/career-path/import-actions";
import { CAREER_PATH_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/** Career-path edges import, on the shared dialog (2026-08-24). */
export function ImportCareerPathExcelForm() {
  const t = useTranslations("CareerPathPage");

  const fields: ImportFieldSpec[] = [
    // The pair IS the edge: without both ends there is no path to record.
    { key: "fromJobTitle", label: t("importFieldFrom"), columnLabel: CAREER_PATH_IMPORT_COLUMNS.fromJobTitle, isKey: true },
    { key: "toJobTitle", label: t("importFieldTo"), columnLabel: CAREER_PATH_IMPORT_COLUMNS.toJobTitle, isKey: true },
    { key: "requirements", label: t("importFieldRequirements"), columnLabel: CAREER_PATH_IMPORT_COLUMNS.requirements },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      templateHref="/templates/sru-career-path-import-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importCareerPathExcel}
      pendingLabel={t("importing")}
    >
      {(state: CareerPathImportResult | null) => <CareerPathImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function CareerPathImportOutcome({ state }: { state: CareerPathImportResult | null }) {
  const t = useTranslations("CareerPathPage");
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
