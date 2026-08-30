"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importOrgUnitsExcel, type OrgUnitsImportResult } from "@/app/[locale]/(app)/org-units/import-actions";
import { ORG_UNIT_IMPORT_COLUMNS } from "@/lib/importColumns";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/**
 * Org units import, on the shared dialog: the mode choice, the column mapping
 * and the field selection all come from `ExcelImportDialog`, so this file only
 * declares what a unit's fields are and how to render the result.
 *
 * There is no separate downloadable template — the export IS the template, so
 * the two cannot drift apart (the same choice the strategic-plan import made).
 */
export function ImportOrgUnitsExcelForm() {
  const t = useTranslations("OrgUnitsPage");

  const fields: ImportFieldSpec[] = [
    // Name and parent together identify a unit: unit_code is genuinely empty
    // on many rows, while UNIQUE(parent_id, name_ar) makes the pair real.
    { key: "nameAr", label: t("fieldNameAr"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.nameAr, isKey: true },
    { key: "parentName", label: t("fieldParent"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.parentName, isKey: true },
    { key: "kind", label: t("fieldKind"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.kind },
    { key: "type", label: t("fieldType"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.type },
    { key: "nameEn", label: t("fieldNameEn"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.nameEn },
    { key: "unitCode", label: t("fieldCode"), columnLabel: ORG_UNIT_IMPORT_COLUMNS.unitCode },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={t("importNote")}
      fields={fields}
      action={importOrgUnitsExcel}
      pendingLabel={t("importing")}
      triggerVariant="primary"
    >
      {(state: OrgUnitsImportResult) => <OrgUnitsImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function OrgUnitsImportOutcome({ state }: { state: OrgUnitsImportResult }) {
  const t = useTranslations("OrgUnitsPage");
  const router = useRouter();

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  if (!state) return null;

  if (state.status === "error") {
    return (
      <p role="alert" style={{ color: "#b91c1c", fontSize: 12.5, marginTop: 10 }}>
        <AlertCircle size={14} aria-hidden style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
        {t(errorMessageKeys[state.message] ?? "importErrorUnknown")}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ color: "var(--sru-success, #1f9d55)", fontSize: 12.5 }}>
        <CheckCircle2 size={14} aria-hidden style={{ marginInlineEnd: 6, verticalAlign: "-2px" }} />
        {t("importSummary", { created: state.created, updated: state.updated })}
      </p>
      {/* Rows the importer could not place are named, not swallowed: a silent
          skip reads as a successful import of everything. */}
      {state.rowErrors.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: "#b91c1c", fontSize: 12 }}>
            {t("importRowErrors", { count: state.rowErrors.length })}
          </p>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18, fontSize: 11.5, color: "var(--sru-muted)" }}>
            {state.rowErrors.slice(0, 12).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
