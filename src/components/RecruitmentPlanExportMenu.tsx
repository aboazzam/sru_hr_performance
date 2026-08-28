"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * One "تصدير" button opening Excel / CSV / PDF — the same shape
 * `EmployeesExportMenu` already gives the employees list, asked for here as
 * "كما فعلنا في الشاشات الأخرى". It replaces three separate header buttons.
 *
 * PDF goes to this plan's OWN print view rather than calling `window.print()`
 * on the current page: that view exists precisely to lay the plan out for
 * paper, and printing this screen would carry the tabs, the action row and
 * the progress bar onto the sheet. It is also what makes deleting the
 * separate "عرض للطباعة" button lossless — the capability moved, it did not
 * disappear.
 *
 * Excel and CSV stay plain `<a download>` links to the Route Handler under
 * `/api`, which re-queries through the caller's own session; no column
 * picker here, unlike the employees list, because none was asked for and the
 * plan export has no equivalent "hidden fields" problem.
 */
export function RecruitmentPlanExportMenu({ planId }: { planId: string }) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
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

  const itemStyle = {
    width: "100%",
    textAlign: "start" as const,
    background: "none",
    border: "none",
    cursor: "pointer",
  };

  return (
    <div className="sru-user-menu no-print" ref={rootRef}>
      <button
        type="button"
        className="sru-btn sru-btn-primary sru-btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t("exportMenu")}
      </button>
      {open && (
        <div className="sru-user-menu-panel" role="menu">
          <a
            role="menuitem"
            className="sru-user-menu-item"
            href={`/api/recruitment/plan/${planId}/export?format=xlsx`}
            download
            onClick={() => setOpen(false)}
          >
            {t("exportExcel")}
          </a>
          <a
            role="menuitem"
            className="sru-user-menu-item"
            href={`/api/recruitment/plan/${planId}/export?format=csv`}
            download
            onClick={() => setOpen(false)}
          >
            {t("exportCsv")}
          </a>
          <button
            type="button"
            role="menuitem"
            className="sru-user-menu-item"
            style={itemStyle}
            onClick={() => {
              setOpen(false);
              router.push(`/recruitment/plan/${planId}/print`);
            }}
          >
            {t("exportPdf")}
          </button>
        </div>
      )}
    </div>
  );
}
