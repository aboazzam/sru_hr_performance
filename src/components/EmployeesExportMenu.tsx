"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  EMPLOYEE_EXPORT_COLUMNS,
  DEFAULT_EMPLOYEE_EXPORT_COLUMNS,
  type EmployeeExportColumn,
} from "@/lib/employeeExportColumns";

// Replaces the plain PrintButton on /employees per the 2026-07-24 request
// ("استبدل زر طباعة بتصدير ثم يتم الاختيار بين pdf or excel or csv").
// PDF reuses the existing window.print() mechanism (this project has no PDF
// generation library and sru-print.css already exists for exactly this) —
// Excel/CSV hit a real Route Handler that re-queries the data through the
// caller's own RLS-respecting session, same discipline as every export
// feature in this app.
//
// 2026-07-25: "عند التصدير يطلع شاشة على شكل checkboxes لتحديد الخانات التي
// تحتاج تصديرها من كامل النموذج وليس المعروض فقط" — Excel/CSV now open a
// column-picker dialog (same native <dialog> pattern as
// ImportOrgStructureExcelForm) instead of downloading immediately, listing
// every field the add/edit forms know about, not just the 6 columns the
// table itself shows. Preselected to that original 6-column set so the
// default export experience is unchanged unless the caller deliberately
// picks something else.
export function EmployeesExportMenu() {
  const t = useTranslations("EmployeesPage");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "xlsx" | null>(null);
  const [selected, setSelected] = useState<Set<EmployeeExportColumn>>(new Set(DEFAULT_EMPLOYEE_EXPORT_COLUMNS));

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function openColumnPicker(format: "csv" | "xlsx") {
    setOpen(false);
    setPendingFormat(format);
    dialogRef.current?.showModal();
  }

  function toggleColumn(column: EmployeeExportColumn) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
  }

  const exportHref = pendingFormat
    ? `/api/employees/export?format=${pendingFormat}&columns=${[...selected].join(",")}`
    : "#";

  return (
    <>
      <div className="sru-user-menu no-print" ref={rootRef}>
        <button
          type="button"
          className="sru-print-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("exportButton")}
        </button>
        {open && (
          <div className="sru-user-menu-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              className="sru-user-menu-item"
              style={{ width: "100%", textAlign: "start", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => {
                setOpen(false);
                window.print();
              }}
            >
              {t("exportPdf")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="sru-user-menu-item"
              style={{ width: "100%", textAlign: "start", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => openColumnPicker("xlsx")}
            >
              {t("exportExcel")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="sru-user-menu-item"
              style={{ width: "100%", textAlign: "start", background: "none", border: "none", cursor: "pointer" }}
              onClick={() => openColumnPicker("csv")}
            >
              {t("exportCsv")}
            </button>
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t("exportColumnsHeading")}</h3>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="sru-modal-close"
            aria-label={t("closeButton")}
          >
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{t("exportColumnsNote")}</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8,
            marginBottom: 16,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {EMPLOYEE_EXPORT_COLUMNS.map((column) => (
            <label key={column} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input type="checkbox" checked={selected.has(column)} onChange={() => toggleColumn(column)} />
              {t(`exportColumn.${column}`)}
            </label>
          ))}
        </div>

        <a
          href={exportHref}
          download={pendingFormat ? `employees.${pendingFormat}` : undefined}
          className="sru-btn sru-btn-primary"
          style={{ pointerEvents: selected.size === 0 ? "none" : undefined, opacity: selected.size === 0 ? 0.5 : 1 }}
          onClick={() => dialogRef.current?.close()}
        >
          {t("exportConfirmButton")}
        </a>
      </dialog>
    </>
  );
}
