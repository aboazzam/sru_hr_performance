"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  navItems,
  navGroups,
  navItemHref,
  isNavItemActive,
  isNavGroupActive,
  visibleNavItems,
  visibleNavGroups,
  sidebarGroupLabelKey,
} from "./navItems";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";

// Replaces the horizontal NavBar (2026-07-24 request): a vertical sidebar,
// right-side in RTL / left-side in LTR (plain flex row respects direction,
// no explicit left/right needed). Each of the three groups (الإدارة / طرق
// التقييم / نتائج التقييم) renders as ONE row here, linking to its first
// visible child — its siblings appear as a tab bar at the top of the page
// itself (GroupTabs.tsx), not nested in this sidebar, per the explicit
// "العناوين الفرعية تكون على شكل تابات في أعلى الصفحة" instruction.
export function Sidebar({
  permissions,
  hasSubordinates = false,
}: {
  permissions: Partial<Record<ProcessArea, VpraLevel>>;
  hasSubordinates?: boolean;
}) {
  const t = useTranslations("NavBar");
  const pathname = usePathname();
  const context = { hasSubordinates };
  const items = visibleNavItems(navItems, permissions, context);
  const groups = visibleNavGroups(navGroups, permissions, context);

  return (
    <nav className="sru-sidebar">
      {items.map(({ segment, labelKey, icon: Icon }) => (
        <Link
          key={segment || "home"}
          href={navItemHref(segment)}
          className={`sru-sidebar-item${isNavItemActive(segment, pathname) ? " active" : ""}`}
        >
          <Icon size={18} aria-hidden />
          <span>{t(labelKey)}</span>
        </Link>
      ))}

      {groups.map((group) => (
        <Link
          key={group.groupKey}
          href={navItemHref(group.children[0].segment)}
          className={`sru-sidebar-item${isNavGroupActive(group, pathname) ? " active" : ""}`}
        >
          <group.icon size={18} aria-hidden />
          <span>{t(sidebarGroupLabelKey(group))}</span>
        </Link>
      ))}
    </nav>
  );
}
