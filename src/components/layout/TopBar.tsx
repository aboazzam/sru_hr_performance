"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { locales, type Locale } from "@/i18n/config";
import { Link, usePathname } from "@/i18n/navigation";

const localeLabels: Record<Locale, string> = {
  ar: "عربي",
  en: "English",
};

export function TopBar({
  locale,
  userName,
}: {
  locale: Locale;
  userName?: string;
}) {
  const t = useTranslations("TopBar");
  const pathname = usePathname();
  const otherLocale = locales.find((l) => l !== locale) ?? locale;

  return (
    <header className="sru-topbar">
      <span className="sru-topbar-brand">
        <Image
          src="/logo-white.png"
          alt="جامعة سليمان الراجحي"
          width={120}
          height={26}
          style={{ height: 26, width: "auto" }}
          priority
        />
      </span>
      <div className="sru-topbar-meta">
        <button type="button" className="sru-icon-btn">
          <Bell size={16} aria-hidden />
          {t("notifications")}
        </button>
        <span className="divider" aria-hidden />
        <Link href={pathname} locale={otherLocale} className="pill">
          {localeLabels[otherLocale]}
          <ChevronDown size={13} aria-hidden />
        </Link>
        <span className="divider" aria-hidden />
        <button type="button" className="sru-icon-btn">
          {userName ?? t("login")}
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </header>
  );
}
