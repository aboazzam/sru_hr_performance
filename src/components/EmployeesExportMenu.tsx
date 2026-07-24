"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Replaces the plain PrintButton on /employees per the 2026-07-24 request
// ("استبدل زر طباعة بتصدير ثم يتم الاختيار بين pdf or excel or csv").
// PDF reuses the existing window.print() mechanism (this project has no PDF
// generation library and sru-print.css already exists for exactly this) —
// Excel/CSV hit a real Route Handler that re-queries the data through the
// caller's own RLS-respecting session, same discipline as every export
// feature in this app.
export function EmployeesExportMenu() {
  const t = useTranslations("EmployeesPage");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
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
          <a
            href="/api/employees/export?format=xlsx"
            download="employees.xlsx"
            role="menuitem"
            className="sru-user-menu-item"
            onClick={() => setOpen(false)}
          >
            {t("exportExcel")}
          </a>
          <a
            href="/api/employees/export?format=csv"
            download="employees.csv"
            role="menuitem"
            className="sru-user-menu-item"
            onClick={() => setOpen(false)}
          >
            {t("exportCsv")}
          </a>
        </div>
      )}
    </div>
  );
}
