"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { User as UserIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Avatar is a generic icon placeholder for now — no photo column or Storage
// bucket exists yet (per the project owner's explicit "start with a generic
// icon now, add photo upload later" decision, 2026-07-22).
export function UserMenu({ userName }: { userName?: string }) {
  const t = useTranslations("TopBar");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const items: Array<{ href: string; label: string }> = [
    { href: "/profile#my-data", label: t("myData") },
    { href: "/profile#my-competencies", label: t("myCompetencies") },
    // Points at the real KPI module (2026-07-27), not /profile#my-kpis —
    // that section was always the interim "goals relabeled as KPIs"
    // placeholder (2026-07-22), now stale since a real cascaded-KPI system
    // exists. Left the /profile section itself untouched (separate scope).
    { href: "/kpis", label: t("myKpis") },
    { href: "/profile#my-tasks", label: t("myTasks") },
    { href: "/profile#my-performance", label: t("myPerformance") },
    // /change-password already existed for the forced first-login change, but
    // nothing linked to it — so anyone who simply WANTED to change their
    // password had no way in. Last in the list: it is account upkeep, not one
    // of the profile sections above it.
    { href: "/change-password", label: t("changePassword") },
  ];

  return (
    <div className="sru-user-menu" ref={rootRef}>
      {userName && <span className="sru-user-greeting">{t("greeting", { name: userName })}</span>}
      <button
        type="button"
        className="sru-avatar-btn"
        aria-label={t("userMenuAlt")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <UserIcon size={16} aria-hidden />
      </button>
      {open && (
        <div className="sru-user-menu-panel" role="menu">
          {userName && <div className="sru-user-menu-name">{userName}</div>}
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="sru-user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
