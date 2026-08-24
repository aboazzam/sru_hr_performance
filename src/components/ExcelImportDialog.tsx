"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { inspectExcelFile, type InspectExcelResult } from "@/app/actions/inspect-excel";
import type { ImportMode } from "@/lib/excelImportOptions";

export interface ImportFieldSpec {
  /** Canonical key the importer knows this field by. */
  key: string;
  label: string;
  /**
   * The header this importer actually reads the field from, when it differs
   * from the display label. Our own templates use these raw headers
   * ("EMPLOYEE NUMBER", "الادارة"), so without them a file exported from this
   * very app would arrive with almost nothing auto-mapped.
   */
  columnLabel?: string;
  /**
   * A key column identifies the row (employee number, job title name…). It is
   * always written and cannot be unticked — without it the importer cannot
   * tell which row a line refers to.
   */
  isKey?: boolean;
}

/**
 * The shared import dialog: choose what the import may do, map the file's
 * columns, pick the fields, then run it.
 *
 * Asked for on 2026-08-24 for every import button in the app, so it lives here
 * once instead of five times. Each importer supplies its own field list, its
 * own Server Action and its own result rendering; the steps, the warning and
 * the wire format (`importMode` / `importMapping` / `importFields`) are the
 * same everywhere.
 *
 * Step 2 exists because a real file rarely uses our exact column names: the
 * mapping is pre-filled by exact label match and left for the caller to
 * correct, because a column silently read as the wrong field writes wrong data
 * without complaining.
 */
export function ExcelImportDialog({
  triggerLabel,
  heading,
  subtitle,
  note,
  templateHref,
  templateLabel,
  fields,
  action,
  pendingLabel,
  extraFields,
  children,
}: {
  triggerLabel: string;
  heading: string;
  subtitle?: string;
  note?: ReactNode;
  templateHref?: string;
  templateLabel?: string;
  fields: ImportFieldSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each importer has its own result shape; the dialog only forwards it to `children`.
  action: (prev: any, formData: FormData) => Promise<any>;
  pendingLabel: string;
  /** Hidden values the importer needs (a plan id, say). */
  extraFields?: Record<string, string>;
  /** Renders the importer's own result. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see `action`.
  children?: (state: any) => ReactNode;
}) {
  const t = useTranslations("ExcelImport");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasMappableFields = fields.length > 0;
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<ImportMode>("insert_only");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set(fields.map((f) => f.key)));

  const [inspect, inspectAction, inspecting] = useActionState<InspectExcelResult | null, FormData>(
    inspectExcelFile,
    null
  );
  const [importState, importAction, importing] = useActionState(action, null);

  // Derived during render, not in an effect: this repo forbids setState inside
  // useEffect, and moving to step 2 is a reaction to a value change.
  const [handledInspect, setHandledInspect] = useState<InspectExcelResult | null>(null);
  if (inspect !== handledInspect) {
    setHandledInspect(inspect);
    if (inspect?.status === "success" && hasMappableFields) {
      const headers = inspect.sheets.flatMap((s) => s.headers);
      const guess: Record<string, string> = {};
      for (const header of headers) {
        const exact = fields.find((f) => f.label === header || f.columnLabel === header);
        guess[header] = exact ? exact.key : "";
      }
      setMapping(guess);
      // Only fields an actual column feeds can be written; the rest would
      // write nothing but still claim to be selected.
      const mapped = new Set(Object.values(guess).filter((v) => v !== ""));
      setSelected(new Set(fields.filter((f) => f.isKey || mapped.has(f.key)).map((f) => f.key)));
      setStep(2);
    }
  }

  useEffect(() => {
    if (importState?.status === "success" && fileInputRef.current) fileInputRef.current.value = "";
  }, [importState]);

  function open() {
    setStep(1);
    setMode("insert_only");
    setFile(null);
    setHandledInspect(null);
    dialogRef.current?.showModal();
  }

  const mappedFields = new Set(Object.values(mapping).filter((v) => v !== ""));
  const totalRows = inspect?.status === "success" ? inspect.sheets.reduce((sum, s) => sum + s.rowCount, 0) : 0;

  return (
    <>
      <button type="button" onClick={open} className="sru-btn">
        <ArrowDownToLine size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{heading}</h3>
            {step === 1
              ? subtitle && <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 2 }}>{subtitle}</p>
              : inspect?.status === "success" && (
                  <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 2 }}>
                    {t("summaryLine", { rows: totalRows, mode: t(mode === "upsert" ? "modeUpsertShort" : "modeInsertShort") })}
                  </p>
                )}
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={t("close")}>
            ×
          </button>
        </div>

        {step === 1 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData();
              if (file) formData.set("file", file);
              if (hasMappableFields) {
                startTransition(() => inspectAction(formData));
                return;
              }
              // Nothing to map: the mode is the whole question here.
              formData.set("importMode", mode);
              for (const [k, v] of Object.entries(extraFields ?? {})) formData.set(k, v);
              startTransition(() => importAction(formData));
            }}
            style={{ marginTop: 14 }}
          >
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("modeQuestion")}</legend>
              {(["insert_only", "upsert"] as const).map((value) => (
                <label key={value} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {t(value === "insert_only" ? "modeInsertTitle" : "modeUpsertTitle")}
                    </span>
                    <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.7 }}>
                      {t(value === "insert_only" ? "modeInsertNote" : "modeUpsertNote")}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {/* The one thing import never does, said before it runs rather
                than left to be discovered. */}
            <p className="sru-import-warning">
              <AlertTriangle size={15} aria-hidden style={{ flex: "0 0 auto", marginTop: 1 }} />
              <span>{t("noDeleteWarning")}</span>
            </p>

            {note && <div style={{ color: "var(--sru-muted)", fontSize: 12.5, lineHeight: 1.7, marginTop: 10 }}>{note}</div>}

            <div className="sru-field" style={{ marginTop: 12 }}>
              <label>{t("fileLabel")}</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("fileHint")}</span>
            </div>

            {inspect?.status === "error" && (
              <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
                {t(
                  inspect.message === "empty"
                    ? "errorEmpty"
                    : inspect.message === "unauthenticated"
                      ? "errorUnauthenticated"
                      : "errorInvalidFile"
                )}
              </p>
            )}

            {!hasMappableFields && children?.(importState)}

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button
                type="submit"
                className="sru-btn sru-btn-primary"
                disabled={!file || inspecting || importing}
              >
                {hasMappableFields ? (
                  inspecting ? (
                    t("reading")
                  ) : (
                    t("next")
                  )
                ) : (
                  <>
                    <ArrowDownToLine size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
                    {importing ? pendingLabel : t("runImport")}
                  </>
                )}
              </button>
              {templateHref && (
                <a href={templateHref} download className="sru-btn">
                  <ArrowUpFromLine size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
                  {templateLabel ?? t("template")}
                </a>
              )}
            </div>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData();
              if (file) formData.set("file", file);
              formData.set("importMode", mode);
              formData.set("importMapping", JSON.stringify(mapping));
              formData.set("importFields", JSON.stringify([...selected]));
              for (const [k, v] of Object.entries(extraFields ?? {})) formData.set(k, v);
              startTransition(() => importAction(formData));
            }}
            style={{ marginTop: 14 }}
          >
            <h4 style={{ fontSize: 13, fontWeight: 700 }}>{t("mappingHeading")}</h4>
            <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.7, marginBottom: 8 }}>{t("mappingNote")}</p>

            <div className="table-scroll" style={{ maxHeight: 220 }}>
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("fileColumn")}</th>
                    <th>{t("platformField")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(mapping).map((header) => (
                    <tr key={header}>
                      <td style={{ fontSize: 12.5 }}>{header}</td>
                      <td>
                        <select
                          value={mapping[header] ?? ""}
                          onChange={(e) => {
                            const next = { ...mapping, [header]: e.target.value };
                            setMapping(next);
                            const nowMapped = new Set(Object.values(next).filter((v) => v !== ""));
                            setSelected((prev) => {
                              const kept = new Set([...prev].filter((k) => nowMapped.has(k)));
                              for (const f of fields) if (f.isKey) kept.add(f.key);
                              if (e.target.value !== "") kept.add(e.target.value);
                              return kept;
                            });
                          }}
                        >
                          <option value="">{t("ignoreColumn")}</option>
                          {fields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 style={{ fontSize: 13, fontWeight: 700, marginTop: 14 }}>
              {t(mode === "upsert" ? "fieldsHeadingUpsert" : "fieldsHeadingInsert")}
            </h4>
            <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 8 }}>
              {t(mode === "upsert" ? "fieldsNoteUpsert" : "fieldsNoteInsert")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fields.map((f) => {
                const available = f.isKey || mappedFields.has(f.key);
                return (
                  <label
                    key={f.key}
                    className={`sru-import-fieldchip${selected.has(f.key) ? " is-on" : ""}${available ? "" : " is-off"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(f.key)}
                      disabled={!available || f.isKey}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.key)) next.delete(f.key);
                          else next.add(f.key);
                          return next;
                        })
                      }
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 6 }}>{t("unmappedDisabled")}</p>

            {children?.(importState)}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" className="sru-btn sru-btn-primary" disabled={importing}>
                <ArrowDownToLine size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
                {importing ? pendingLabel : t("runImport")}
              </button>
              <button type="button" className="sru-btn" onClick={() => setStep(1)}>
                {t("back")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
