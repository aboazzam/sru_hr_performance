"use client";

import type { ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * A table row that opens one page — the app-wide version of the behaviour
 * first built for the recruitment plans list and asked for generally on
 * 2026-08-21 ("ألغِ زر فتح البرنامج واجعل الماوس فعالًا عند المرور على
 * الكرت ... واجعل هذا عامًا على كل شاشات التطبيق").
 *
 * A row that navigates has to SAY so before it is clicked, so the pointer
 * and a hover tint arrive together (`tr.sru-row-link` in globals.css) — the
 * cursor alone is easy to miss on a wide table.
 *
 * The row's own title stays a real `<Link className="sru-row-link-title">`
 * even though the row handles the click. That is not redundancy:
 *   - keyboard users reach it by Tab and open it with Enter, which a bare
 *     `onClick` on a `<tr>` gives nobody;
 *   - screen readers announce a link rather than an inert row;
 *   - Ctrl/⌘-click and middle-click open a new tab, which `router.push`
 *     cannot do — a plain JS row would silently take that away.
 *
 * Clicks that already landed on a control are left alone, so per-row
 * actions (edit, delete, a status select) keep working and nothing fires
 * twice — including controls added to the row later.
 */
export function RowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <tr
      className={className ? `sru-row-link ${className}` : "sru-row-link"}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea, label, [role='button']")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
