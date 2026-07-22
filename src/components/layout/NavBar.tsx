"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { navItems, navItemHref, isNavItemActive, visibleNavItems } from "./navItems";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";

export function NavBar({ permissions }: { permissions: Partial<Record<ProcessArea, VpraLevel>> }) {
  const t = useTranslations("NavBar");
  const pathname = usePathname();
  const items = visibleNavItems(navItems, permissions);

  return (
    <nav className="sru-navbar">
      {items.map(({ segment, labelKey, icon: Icon }) => (
        <Link
          key={segment || "home"}
          href={navItemHref(segment)}
          className={`sru-nav-item${isNavItemActive(segment, pathname) ? " active" : ""}`}
        >
          <Icon size={17} aria-hidden />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
