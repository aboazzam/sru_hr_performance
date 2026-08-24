"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { ExcelImportDialog } from "@/components/ExcelImportDialog";
import { importStrategicPlanExcel, type ImportStrategicPlanState } from "@/app/[locale]/(app)/kpis/plans/[id]/import-actions";
import { STRATEGIC_PLAN_SHEETS } from "@/lib/strategicPlanExcel";

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
const SHEET_KEYS = Object.keys(STRATEGIC_PLAN_SHEETS) as SheetKey[];
type SheetKey = keyof typeof STRATEGIC_PLAN_SHEETS;

const menuItemStyle = {
  width: "100%",
  textAlign: "start" as const,
  background: "none",
  border: "none",
  cursor: "pointer",
};

export function StrategicPlanExcelButtons({ planId, canImport }: { planId: string; canImport: boolean }) {
  const t = useTranslations("StrategicPlanDetailPage");
  const menuRef = useRef<HTMLDivElement>(null);
  const sheetDialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("xlsx");
  const [selectedSheets, setSelectedSheets] = useState<Set<SheetKey>>(() => new Set(SHEET_KEYS));
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  function openSheetPicker(format: "csv" | "xlsx") {
    setMenuOpen(false);
    setExportFormat(format);
    // Excel takes the whole workbook by default; CSV cannot, so it starts on
    // one sheet rather than on a selection it would have to reject.
    setSelectedSheets(format === "csv" ? new Set([SHEET_KEYS[0]]) : new Set(SHEET_KEYS));
    sheetDialogRef.current?.showModal();
  }

  function toggleSheet(key: SheetKey) {
    setSelectedSheets((prev) => {
      if (exportFormat === "csv") return new Set([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <div className="sru-user-menu no-print" ref={menuRef}>
        <button
          type="button"
          className="sru-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ArrowUpFromLine size={15} aria-hidden />
          {t("exportButton")}
        </button>
        {menuOpen && (
          <div className="sru-user-menu-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              className="sru-user-menu-item"
              style={menuItemStyle}
              onClick={() => {
                setMenuOpen(false);
                window.print();
              }}
            >
              {t("exportPdf")}
            </button>
            <button type="button" role="menuitem" className="sru-user-menu-item" style={menuItemStyle} onClick={() => openSheetPicker("xlsx")}>
              {t("exportExcel")}
            </button>
            <button type="button" role="menuitem" className="sru-user-menu-item" style={menuItemStyle} onClick={() => openSheetPicker("csv")}>
              {t("exportCsv")}
            </button>
          </div>
        )}
      </div>

      <dialog
        ref={sheetDialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === sheetDialogRef.current) sheetDialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t("exportSheetsHeading")}</h3>
          <button type="button" onClick={() => sheetDialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>
          {exportFormat === "csv" ? t("exportSheetsNoteCsv") : t("exportSheetsNoteExcel")}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, marginBottom: 16 }}>
          {SHEET_KEYS.map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input
                // A CSV holds one table, so the picker becomes single-choice
                // for it rather than quietly exporting only the first tick.
                type={exportFormat === "csv" ? "radio" : "checkbox"}
                name="sheet"
                checked={selectedSheets.has(key)}
                onChange={() => toggleSheet(key)}
              />
              {STRATEGIC_PLAN_SHEETS[key]}
            </label>
          ))}
        </div>

        <a
          href={`/api/strategic-plans/${planId}/export?format=${exportFormat}&sheets=${[...selectedSheets].join(",")}`}
          className="sru-btn sru-btn-primary"
          style={{ pointerEvents: selectedSheets.size === 0 ? "none" : undefined, opacity: selectedSheets.size === 0 ? 0.5 : 1 }}
          onClick={() => sheetDialogRef.current?.close()}
        >
          {t("exportConfirmButton")}
        </a>
      </dialog>

      {!canImport ? null : (
        <ExcelImportDialog
          triggerLabel={t("importButton")}
          heading={t("importHeading")}
          subtitle={t("importNote")}
          // No mappable fields on purpose: this workbook's nine sheets and
          // their columns ARE this app's own export format, so there is
          // nothing to map them onto. The dialog still asks what the import
          // may do, which is the question that matters here.
          fields={[]}
          action={importStrategicPlanExcel}
          pendingLabel={t("importSubmitting")}
          extraFields={{ planId }}
        >
          {(state: ImportStrategicPlanState) => <StrategicPlanImportOutcome state={state} />}
        </ExcelImportDialog>
      )}
    </>
  );
}

/** The plan importer's own result, rendered inside the shared dialog. */
function StrategicPlanImportOutcome({ state }: { state: ImportStrategicPlanState }) {
  const t = useTranslations("StrategicPlanDetailPage");
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
      <p style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: state.warnings.length > 0 ? 8 : 0 }}>
        <CheckCircle2 size={15} aria-hidden />
        {t("importSuccess", {
          goals: state.summary.goalsCreated + state.summary.goalsUpdated,
          subGoals: state.summary.subGoalsCreated + state.summary.subGoalsUpdated,
          kpis: state.summary.kpisCreated + state.summary.kpisUpdated,
          targets: state.summary.annualTargetsCreated + state.summary.annualTargetsUpdated,
          values: state.summary.valuesCreated + state.summary.valuesUpdated,
          programs: state.summary.programsCreated + state.summary.programsUpdated,
          initiatives: state.summary.initiativesCreated + state.summary.initiativesUpdated,
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
  );
}
