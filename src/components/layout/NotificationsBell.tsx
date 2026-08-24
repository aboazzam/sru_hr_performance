"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { markNotificationsRead } from "@/app/[locale]/(app)/notifications-actions";

export interface NotificationRow {
  id: string;
  message_ar: string;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The bell in the TopBar. It has existed since early in the project as a
 * static button with no onClick and nothing behind it; this is what makes it
 * real.
 *
 * The rows are fetched server-side in (app)/layout.tsx and passed down, so
 * this component never queries — one query per page load for every page,
 * rather than a client round-trip after hydration.
 *
 * Dropdown mechanics (outside click + Escape to close) mirror UserMenu,
 * which established that pattern in this codebase.
 */
export function NotificationsBell({ notifications }: { notifications: NotificationRow[] }) {
  const t = useTranslations("TopBar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function markAllRead() {
    startTransition(async () => {
      await markNotificationsRead(notifications.filter((n) => n.read_at === null).map((n) => n.id));
      router.refresh();
    });
  }

  return (
    <div className="sru-user-menu" ref={containerRef}>
      <button
        type="button"
        className="sru-icon-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("notifications")}
      >
        <Bell size={16} aria-hidden />
        {t("notifications")}
        {unreadCount > 0 && (
          <span
            className="pill"
            style={{
              marginInlineStart: 6,
              background: "#b91c1c",
              color: "#fff",
              fontSize: 10.5,
              padding: "0 6px",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="sru-user-menu-panel" style={{ minWidth: 320, maxWidth: 380 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderBottom: "1px solid var(--sru-border)",
            }}
          >
            <strong style={{ fontSize: 12 }}>{t("notifications")}</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                className="sru-btn"
                style={{ fontSize: 10.5, padding: "2px 8px" }}
                disabled={pending}
                onClick={markAllRead}
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, padding: "10px" }}>
              {t("noNotifications")}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 340, overflowY: "auto" }}>
              {notifications.map((notification) => {
                const body = (
                  <span style={{ fontSize: 11.5, lineHeight: 1.7 }}>{notification.message_ar}</span>
                );
                return (
                  <li
                    key={notification.id}
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--sru-border)",
                      background: notification.read_at === null ? "var(--sru-purple-light)" : "transparent",
                    }}
                  >
                    {notification.link_path ? (
                      // `link_path` is stored locale-free; this Link adds the
                      // reader's own locale prefix.
                      <Link href={notification.link_path} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
