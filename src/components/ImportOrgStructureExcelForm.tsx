"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ExcelImportDialog, type ImportFieldSpec } from "@/components/ExcelImportDialog";
import { importOrgStructureExcel, type ImportResult } from "@/app/[locale]/(app)/admin/org-structure/import-actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  forbidden: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/**
 * Employees + organisational-structure import, on the shared dialog
 * (2026-08-24).
 *
 * `templateHref`/`note` still let each page point at its own template and
 * wording: the Employees page uses an employees-only template, while the
 * org-structure and staffing pages keep the combined one. The action tolerates
 * either shape (the structure sheet is optional).
 *
 * The listed fields are the EMPLOYEE columns — the ones a caller actually
 * wants to choose between when re-importing a staff list. The structure
 * sheet's own columns (code, parent code, level) describe the tree's shape
 * rather than a record's attributes, so there is nothing meaningful to tick
 * or untick there; a column the dialog does not name is left exactly as the
 * file has it.
 */
export function ImportOrgStructureExcelForm({
  templateHref = "/templates/sru-org-structure-import-template.xlsx",
  note,
}: {
  templateHref?: string;
  note?: string;
} = {}) {
  const t = useTranslations("OrgStructurePage");

  const fields: ImportFieldSpec[] = [
    { key: "employeeNumber", label: t("importFieldEmployeeNumber"), isKey: true },
    { key: "fullNameAr", label: t("importFieldNameAr"), isKey: true },
    { key: "fullNameEn", label: t("importFieldNameEn") },
    { key: "email", label: t("importFieldEmail") },
    { key: "department", label: t("importFieldDepartment") },
    { key: "positionAr", label: t("importFieldPosition") },
    { key: "role", label: t("importFieldRole") },
    { key: "hireDate", label: t("importFieldHireDate") },
    { key: "qualification", label: t("importFieldQualification") },
    { key: "educationSpeciality", label: t("importFieldSpeciality") },
    { key: "dateOfBirth", label: t("importFieldDateOfBirth") },
    { key: "mobile", label: t("importFieldMobile") },
    { key: "maritalStatus", label: t("importFieldMaritalStatus") },
    { key: "gender", label: t("importFieldGender") },
    { key: "nationality", label: t("importFieldNationality") },
    { key: "employeeCategory", label: t("importFieldEmployeeCategory") },
    { key: "insuranceCategory", label: t("importFieldInsuranceCategory") },
  ];

  return (
    <ExcelImportDialog
      triggerLabel={t("importTriggerButton")}
      heading={t("importHeading")}
      subtitle={note ?? t("importNote")}
      templateHref={templateHref}
      templateLabel={t("downloadTemplateButton")}
      fields={fields}
      action={importOrgStructureExcel}
      pendingLabel={t("importing")}
      submitLabel={t("importButton")}
    >
      {(state: ImportResult | null) => <OrgStructureImportOutcome state={state} />}
    </ExcelImportDialog>
  );
}

function OrgStructureImportOutcome({ state }: { state: ImportResult | null }) {
  const t = useTranslations("OrgStructurePage");
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

  const allErrors = [
    ...state.summary.employeeErrors,
    ...state.summary.roleErrors,
    ...state.summary.positionErrors,
    ...state.summary.assignmentErrors,
  ];

  return (
    <div style={{ marginTop: 12, fontSize: 12.5 }}>
      <p role="status" style={{ color: "var(--sru-success, #15803d)", marginBottom: 8 }}>
        {t("importSuccess", {
          employees: state.summary.employeesUpserted,
          roles: state.summary.rolesAssigned,
          levels: state.summary.levelsCreated,
          positions: state.summary.positionsUpserted,
          assignments: state.summary.assignmentsCreated,
        })}
      </p>
      {state.summary.corrections.length > 0 && (
        <details style={{ marginBottom: 6 }}>
          <summary>{t("importCorrections", { count: state.summary.corrections.length })}</summary>
          <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
            {state.summary.corrections.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      )}
      {state.summary.unmatchedOrgUnits.length > 0 && (
        <details style={{ marginBottom: 6 }}>
          <summary>{t("importUnmatchedOrgUnits", { count: state.summary.unmatchedOrgUnits.length })}</summary>
          <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
            {state.summary.unmatchedOrgUnits.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </details>
      )}
      {allErrors.length > 0 && (
        <details>
          <summary className="text-red-600">{t("importWarnings", { count: allErrors.length })}</summary>
          <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
            {allErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
