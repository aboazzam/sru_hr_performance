"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { importOrgStructureExcel, type ImportResult } from "@/app/[locale]/(app)/admin/org-structure/import-actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  forbidden: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

export function ImportOrgStructureExcelForm() {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ImportResult | null, FormData>(importOrgStructureExcel, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [handledState, setHandledState] = useState<ImportResult | null>(null);

  if (state !== handledState) {
    setHandledState(state);
    if (state?.status === "success") setFileName(null);
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="sru-card" style={{ padding: 16, maxWidth: 480 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("importHeading")}</h3>
      <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 10 }}>{t("importNote")}</p>
      <form ref={formRef} action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept=".xlsx"
          required
          style={{ display: "none" }}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="sru-btn"
          >
            {t("chooseFileButton")}
          </button>
          <span style={{ fontSize: 12.5, color: fileName ? "var(--foreground)" : "var(--sru-muted)" }}>
            {fileName ?? t("noFileChosen")}
          </span>
        </div>
        <button
          type="submit"
          disabled={pending || !fileName}
          className="sru-btn sru-btn-primary"
          style={{ alignSelf: "flex-start" }}
        >
          {pending ? t("importing") : t("importButton")}
        </button>
      </form>

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 10 }}>
          {t(errorMessageKeys[state.message] ?? "importErrorUnknown")}
        </p>
      )}

      {state?.status === "success" && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <p role="status" style={{ color: "var(--sru-success, #15803d)", marginBottom: 8 }}>
            {t("importSuccess", {
              employees: state.summary.employeesUpserted,
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
          {[...state.summary.employeeErrors, ...state.summary.positionErrors, ...state.summary.assignmentErrors].length > 0 && (
            <details>
              <summary className="text-red-600">
                {t("importWarnings", {
                  count:
                    state.summary.employeeErrors.length +
                    state.summary.positionErrors.length +
                    state.summary.assignmentErrors.length,
                })}
              </summary>
              <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
                {[...state.summary.employeeErrors, ...state.summary.positionErrors, ...state.summary.assignmentErrors].map(
                  (msg, i) => (
                    <li key={i}>{msg}</li>
                  )
                )}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
