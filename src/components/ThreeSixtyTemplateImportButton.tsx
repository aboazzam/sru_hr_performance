"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import {
  importThreeSixtyTemplateExcel,
  type ImportThreeSixtyTemplateResult,
} from "@/app/[locale]/(app)/three-sixty/template/import-actions";
import { THREE_SIXTY_TEMPLATE_FIELDS, THREE_SIXTY_TEMPLATE_SHEETS } from "@/lib/threeSixtyTemplateExcel";

type ErrorMessage = Extract<ImportThreeSixtyTemplateResult, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "importErrorInvalidInput",
  unauthenticated: "importErrorUnauthenticated",
  unknown: "importErrorUnknown",
};

/**
 * 2026-09-04: switched from a small hand-rolled dialog to the shared
 * `ExcelImportDialog` ("كما تعودنا" -- the mode question, column-mapping
 * comparison, and a downloadable template, matching every other importer in
 * this app) -- `importThreeSixtyTemplateExcel` now honors `importMode`/
 * `importMapping`/`importFields` like the rest, closing the gap flagged when
 * this importer was first built.
 */
const IMPORT_FIELDS: ImportFieldSpec[] = (
  Object.keys(THREE_SIXTY_TEMPLATE_FIELDS) as (keyof typeof THREE_SIXTY_TEMPLATE_FIELDS)[]
).flatMap((sheetKey) =>
  THREE_SIXTY_TEMPLATE_FIELDS[sheetKey].map((field) => ({
    key: field.key,
    label: field.label,
    columnLabel: field.column,
    isKey: field.isKey,
    sheet: THREE_SIXTY_TEMPLATE_SHEETS[sheetKey],
  }))
);

export function ThreeSixtyTemplateImportButton() {
  const t = useTranslations("ThreeSixtyTemplatePage");

  return (
    <ExcelImportDialog
      triggerLabel={t("importButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      templateHref="/templates/sru-three-sixty-template.xlsx"
      templateLabel={t("downloadTemplateButton")}
      fields={IMPORT_FIELDS}
      action={importThreeSixtyTemplateExcel}
      pendingLabel={t("importSubmitting")}
    >
      {(state: ImportThreeSixtyTemplateResult | null) => <ThreeSixtyTemplateImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function ThreeSixtyTemplateImportOutcome({ state }: { state: ImportThreeSixtyTemplateResult | null }) {
  const t = useTranslations("ThreeSixtyTemplatePage");
  const router = useRouter();

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  if (!state) return null;

  if (state.status === "error") {
    return (
      <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
        <AlertCircle size={15} aria-hidden />
        {t(errorMessageKeys[state.message])}
      </p>
    );
  }

  return (
    <div role="status" className="sru-auth-alert success" style={{ display: "block", marginTop: 10 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: state.summary.rowErrors.length > 0 ? 8 : 0 }}>
        <CheckCircle2 size={15} aria-hidden />
        {t("importSuccess", {
          raterGroups: state.summary.raterGroups,
          ratingScaleOptions: state.summary.ratingScaleOptions,
          competencies: state.summary.competencies,
          items: state.summary.items,
        })}
      </p>
      {state.summary.rowErrors.length > 0 && (
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 11.5, lineHeight: 1.8 }}>
          {state.summary.rowErrors.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
