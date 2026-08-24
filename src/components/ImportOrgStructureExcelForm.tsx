"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { importOrgStructureExcel, type ImportResult } from "@/app/[locale]/(app)/admin/org-structure/import-actions";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  forbidden: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

// Compact trigger button (sits alongside the page's other header actions,
// per the 2026-07-24 request) that opens a native <dialog> modal explaining
// the import, offering a template download, and hosting the actual form.
//
// `templateHref`/`note` let each page point at its own template + wording:
// the Employees page uses a dedicated employees-only template (no org
// structure sheet at all — 2026-07-24 follow-up), while the org-structure
// and staffing pages keep the combined template. The underlying Server
// Action itself now tolerates either shape (the structure sheet is
// optional), so no other prop is needed to change import behavior.
export function ImportOrgStructureExcelForm({
  templateHref = "/templates/sru-org-structure-import-template.xlsx",
  note,
}: {
  templateHref?: string;
  note?: string;
} = {}) {
  const t = useTranslations("OrgStructurePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike -- here
  // that would silently clear the chosen file on an import error while
  // `fileName` (React state) kept showing the old name, letting a retry
  // submit with no file at all despite the UI still showing one selected.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn sru-btn-primary">
        <ArrowDownToLine size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
        {t("importTriggerButton")}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t("importHeading")}</h3>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="sru-modal-close"
            aria-label={t("closeButton")}
          >
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{note ?? t("importNote")}</p>

        <a
          href={templateHref}
          download
          className="sru-btn sru-btn-secondary"
          style={{ display: "inline-block", marginBottom: 16 }}
        >
          {t("downloadTemplate")}
        </a>

        <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <button type="button" onClick={() => fileInputRef.current?.click()} className="sru-btn">
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
            {[
              ...state.summary.employeeErrors,
              ...state.summary.roleErrors,
              ...state.summary.positionErrors,
              ...state.summary.assignmentErrors,
            ].length > 0 && (
              <details>
                <summary className="text-red-600">
                  {t("importWarnings", {
                    count:
                      state.summary.employeeErrors.length +
                      state.summary.roleErrors.length +
                      state.summary.positionErrors.length +
                      state.summary.assignmentErrors.length,
                  })}
                </summary>
                <ul style={{ paddingInlineStart: 18, color: "var(--sru-muted)" }}>
                  {[
                    ...state.summary.employeeErrors,
                    ...state.summary.roleErrors,
                    ...state.summary.positionErrors,
                    ...state.summary.assignmentErrors,
                  ].map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
