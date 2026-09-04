"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpFromLine } from "lucide-react";
import { THREE_SIXTY_TEMPLATE_SHEETS, type ThreeSixtyTemplateSheetKey } from "@/lib/threeSixtyTemplateExcel";

const SHEET_KEYS = Object.keys(THREE_SIXTY_TEMPLATE_SHEETS) as ThreeSixtyTemplateSheetKey[];

const menuItemStyle = {
  width: "100%",
  textAlign: "start" as const,
  background: "none",
  border: "none",
  cursor: "pointer",
};

/**
 * "زر تصدير بخياراته الثلاث" -- PDF/Excel/CSV, the exact shape already
 * established by `StrategicPlanExcelButtons`: PDF is `window.print()` (the
 * page's own header/actions already carry `no-print`), Excel is the whole
 * 4-sheet workbook in one file, and CSV -- which can only ever hold one
 * table -- opens a sheet picker first rather than silently exporting only
 * the first sheet.
 */
export function ThreeSixtyTemplateExportButtons() {
  const t = useTranslations("ThreeSixtyTemplatePage");
  const menuRef = useRef<HTMLDivElement>(null);
  const sheetDialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<ThreeSixtyTemplateSheetKey>(SHEET_KEYS[0]);

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

  function openCsvPicker() {
    setMenuOpen(false);
    setSelectedSheet(SHEET_KEYS[0]);
    sheetDialogRef.current?.showModal();
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
            <a
              role="menuitem"
              className="sru-user-menu-item"
              style={menuItemStyle}
              href={`/api/three-sixty/template/export?format=xlsx`}
              onClick={() => setMenuOpen(false)}
            >
              {t("exportExcel")}
            </a>
            <button type="button" role="menuitem" className="sru-user-menu-item" style={menuItemStyle} onClick={openCsvPicker}>
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
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("exportSheetsHeading")}</h3>
          <button type="button" onClick={() => sheetDialogRef.current?.close()} className="sru-modal-close" aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 12 }}>{t("exportSheetsNoteCsv")}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
          {SHEET_KEYS.map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
              <input type="radio" name="sheet" checked={selectedSheet === key} onChange={() => setSelectedSheet(key)} />
              {THREE_SIXTY_TEMPLATE_SHEETS[key]}
            </label>
          ))}
        </div>

        <a
          href={`/api/three-sixty/template/export?format=csv&sheets=${selectedSheet}`}
          className="sru-btn sru-btn-primary"
          onClick={() => sheetDialogRef.current?.close()}
        >
          {t("exportConfirmButton")}
        </a>
      </dialog>
    </>
  );
}
