"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { navItems, navItemHref, isNavItemActive } from "./navItems";

export function NavBar() {
  const t = useTranslations("NavBar");
  const pathname = usePathname();

  return (
    <nav className="sru-navbar">
      {navItems.map(({ segment, labelKey, icon: Icon }) => (
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
