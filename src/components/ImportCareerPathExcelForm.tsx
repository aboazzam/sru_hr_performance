"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { importCareerPathExcel, type CareerPathImportResult } from "@/app/[locale]/(app)/career-path/import-actions";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "importErrorInvalid",
  unauthenticated: "importErrorForbidden",
  unknown: "importErrorUnknown",
};

/** Two separate header buttons, matching the exact shape asked for on the
 * job-titles page ("زر استيراد من اكسل وزر تحميل النموذج") — a plain
 * download link for the empty template, and a modal-based import trigger. */
export function ImportCareerPathExcelForm() {
  const t = useTranslations("CareerPathPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<CareerPathImportResult | null, FormData>(
    importCareerPathExcel,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [handledState, setHandledState] = useState<CareerPathImportResult | null>(null);

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
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <>
      <a href="/templates/sru-career-path-import-template.xlsx" download className="sru-btn">
        {t("downloadTemplateButton")}
      </a>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="sru-btn sru-btn-primary">
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
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{t("importNote")}</p>

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
        )}
      </dialog>
    </>
  );
}
