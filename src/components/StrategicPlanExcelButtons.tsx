"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2, Download, Upload } from "lucide-react";
import { importStrategicPlanExcel, type ImportStrategicPlanState } from "@/app/[locale]/(app)/kpis/plans/[id]/import-actions";

type ErrorMessage = Extract<ImportStrategicPlanState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "importErrorInvalidInput",
  unauthenticated: "importErrorUnauthenticated",
  not_found: "importErrorNotFound",
  no_sheets: "importErrorNoSheets",
  unknown: "importErrorUnknown",
};

/**
 * Export is a plain link to the Route Handler (which re-runs the caller's
 * own RLS-scoped queries); import is a <dialog> modal, the pattern already
 * established by ImportOrgStructureExcelForm. The native file input is
 * hidden behind a styled button with a visible filename readout, and submit
 * stays disabled until a file is chosen — the browser's own English
 * "Please select a file" bubble on an Arabic RTL form was a real reported
 * confusion (2026-07-24).
 *
 * There is no separate downloadable template: the exported workbook IS the
 * template, so the two can't drift apart.
 */
export function StrategicPlanExcelButtons({ planId, canImport }: { planId: string; canImport: boolean }) {
  const t = useTranslations("StrategicPlanDetailPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ImportStrategicPlanState, FormData>(importStrategicPlanExcel, null);
  const [handledState, setHandledState] = useState<ImportStrategicPlanState>(null);

  // Derived during render, not in an effect (ESLint react-hooks/
  // set-state-in-effect) -- the same idiom ImportOrgStructureExcelForm
  // already uses to clear the chosen file after a successful import while
  // KEEPING it after a failed one, so a retry doesn't silently submit
  // nothing.
  if (state !== handledState) {
    setHandledState(state);
    if (state?.status === "success") setFileName(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  useEffect(() => {
    if (state?.status === "success") {
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <a
        href={`/api/strategic-plans/${planId}/export`}
        className="sru-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
      >
        <Download size={15} aria-hidden />
        {t("exportButton")}
      </a>

      {!canImport ? null : (
        <>
          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className="sru-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Upload size={15} aria-hidden />
            {t("importButton")}
          </button>

          <dialog
            ref={dialogRef}
            className="sru-modal"
            onClick={(e) => {
              if (e.target === dialogRef.current) dialogRef.current?.close();
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t("importHeading")}</h3>
              <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
                ×
              </button>
            </div>

            <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{t("importNote")}</p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="hidden" name="planId" value={planId} />
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept=".xlsx"
                required
                style={{ display: "none" }}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="sru-btn" onClick={() => fileInputRef.current?.click()}>
                  {t("importChooseFile")}
                </button>
                <span style={{ color: "var(--sru-muted)", fontSize: 13 }}>{fileName ?? t("importNoFile")}</span>
              </div>

              {state?.status === "error" && (
                <p role="alert" className="sru-auth-alert error">
                  <AlertCircle size={15} aria-hidden />
                  {t(errorMessageKeys[state.message])}
                </p>
              )}

              {state?.status === "success" && (
                <div role="status" className="sru-auth-alert success" style={{ display: "block" }}>
                  <p style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: state.warnings.length > 0 ? 8 : 0 }}>
                    <CheckCircle2 size={15} aria-hidden />
                    {t("importSuccess", {
                      goals: state.summary.goalsCreated + state.summary.goalsUpdated,
                      subGoals: state.summary.subGoalsCreated + state.summary.subGoalsUpdated,
                      kpis: state.summary.kpisCreated + state.summary.kpisUpdated,
                      targets: state.summary.annualTargetsCreated + state.summary.annualTargetsUpdated,
                      values: state.summary.valuesCreated + state.summary.valuesUpdated,
                      programs: state.summary.programsCreated + state.summary.programsUpdated,
                    })}
                  </p>
                  {state.warnings.length > 0 && (
                    <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, lineHeight: 1.8 }}>
                      {state.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button type="submit" disabled={pending || !fileName} className="sru-btn sru-btn-primary" style={{ alignSelf: "flex-start" }}>
                {pending ? t("importSubmitting") : t("importSubmit")}
              </button>
            </form>
          </dialog>
        </>
      )}
    </>
  );
}
