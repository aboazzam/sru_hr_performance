"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowDownToLine, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  importThreeSixtyTemplateExcel,
  type ImportThreeSixtyTemplateResult,
} from "@/app/[locale]/(app)/three-sixty/template/import-actions";

/**
 * Deliberately a small, hand-rolled dialog (not the shared 2-step
 * `ExcelImportDialog`): `importThreeSixtyTemplateExcel` always upserts by
 * each sheet's own natural key rather than offering an insert/upsert mode
 * choice, so reusing that dialog's mode-selector step would show a control
 * this importer doesn't actually honor -- see that action's own header for
 * why the simpler shape was chosen for this module.
 */
export function ThreeSixtyTemplateImportButton() {
  const t = useTranslations("ThreeSixtyTemplatePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, formAction, pending] = useActionState<ImportThreeSixtyTemplateResult | null, FormData>(
    importThreeSixtyTemplateExcel,
    null
  );

  // Clearing `file` on success is derived during render (not inside the
  // effect below) per this project's react-hooks/set-state-in-effect rule
  // -- see ProfileTabs.tsx/AddOrgStructurePositionForm.tsx for the same
  // established pattern. router.refresh() itself isn't a setState call, so
  // it stays in the effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.status === "success") setFile(null);
  }

  useEffect(() => {
    if (state?.status === "success") {
      router.refresh();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [state, router]);

  return (
    <>
      <button type="button" className="sru-btn" onClick={() => dialogRef.current?.showModal()}>
        <ArrowDownToLine size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
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
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("importHeading")}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 6, lineHeight: 1.8 }}>{t("importNote")}</p>

        <form action={formAction} style={{ marginTop: 14 }}>
          <div className="sru-field">
            <label>{t("fileLabel")}</label>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
              <AlertCircle size={15} aria-hidden />
              {t("importErrorInvalidInput")}
            </p>
          )}
          {state?.status === "success" && (
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
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="sru-btn sru-btn-primary" disabled={!file || pending}>
              {pending ? t("importSubmitting") : t("runImport")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
