"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpFromLine } from "lucide-react";

export interface ExportColumnOption {
  key: string;
  label: string;
}

/**
 * The "تصدير" control: one button opening PDF / Excel / CSV, with Excel and
 * CSV first asking which columns to include.
 *
 * This is the employees screen's own export menu, generalised so every list
 * gets the same control instead of a bare "تصدير إلى إكسل" link beside a
 * separate print button (2026-08-22: "غيّر كل الأزرار … إلى «تصدير» ونفّذ نفس
 * الموجود في صفحة الموظفين").
 *
 * Labels are passed in rather than read from a namespace, because each screen
 * owns its own messages — the component carries the behaviour, not the words.
 * PDF is `window.print()`: this project has no PDF library and `sru-print.css`
 * exists for exactly this, which is how the employees export already works.
 */
export function ExportMenu({
  columns,
  defaultColumns,
  buildHref,
  filenameBase,
  labels,
}: {
  columns: ExportColumnOption[];
  /** Preselected keys; omit to start with everything ticked. */
  defaultColumns?: string[];
  buildHref: (format: "csv" | "xlsx", columns: string[]) => string;
  filenameBase: string;
  labels: {
    export: string;
    pdf: string;
    excel: string;
    csv: string;
    columnsHeading: string;
    columnsNote: string;
    confirm: string;
    close: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "xlsx" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultColumns ?? columns.map((c) => c.key))
  );

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

  const itemStyle = {
    width: "100%",
    textAlign: "start" as const,
    background: "none",
    border: "none",
    cursor: "pointer",
  };

  return (
    <>
      <div className="sru-user-menu no-print" ref={rootRef}>
        <button
          type="button"
          className="sru-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ArrowUpFromLine size={15} aria-hidden style={{ marginInlineEnd: 6 }} />
          {labels.export}
        </button>
        {open && (
          <div className="sru-user-menu-panel" role="menu">
            <button
              type="button"
              role="menuitem"
              className="sru-user-menu-item"
              style={itemStyle}
              onClick={() => {
                setOpen(false);
                window.print();
              }}
            >
              {labels.pdf}
            </button>
            <button type="button" role="menuitem" className="sru-user-menu-item" style={itemStyle} onClick={() => openColumnPicker("xlsx")}>
              {labels.excel}
            </button>
            <button type="button" role="menuitem" className="sru-user-menu-item" style={itemStyle} onClick={() => openColumnPicker("csv")}>
              {labels.csv}
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
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{labels.columnsHeading}</h3>
          <button type="button" onClick={() => dialogRef.current?.close()} className="sru-modal-close" aria-label={labels.close}>
            ×
          </button>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{labels.columnsNote}</p>

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
          {columns.map((column) => (
            <label key={column.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={selected.has(column.key)}
                onChange={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(column.key)) next.delete(column.key);
                    else next.add(column.key);
                    return next;
                  })
                }
              />
              {column.label}
            </label>
          ))}
        </div>

        <a
          href={pendingFormat ? buildHref(pendingFormat, [...selected]) : "#"}
          download={pendingFormat ? `${filenameBase}.${pendingFormat}` : undefined}
          className="sru-btn sru-btn-primary"
          style={{ pointerEvents: selected.size === 0 ? "none" : undefined, opacity: selected.size === 0 ? 0.5 : 1 }}
          onClick={() => dialogRef.current?.close()}
        >
          {labels.confirm}
        </a>
      </dialog>
    </>
  );
}
