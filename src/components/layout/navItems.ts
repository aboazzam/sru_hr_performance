// Deliberately has zero dependency on next-intl/next-navigation. NavBar.tsx
// imports from here (not the other way around) so this stays importable
// from Vitest without pulling in `next/navigation`, which fails to resolve
// under Vitest in this Next.js version (confirmed: fails even on a bare,
// non-mocked import, in both "node" and "jsdom" environments) — see
// NavBar.test.tsx for the full story.
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  Route,
  Wallet,
  Target,
  ListChecks,
  ClipboardList,
  Award,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  MessagesSquare,
  Gift,
  Briefcase,
} from "lucide-react";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

export interface NavItem {
  segment: string;
  labelKey: string;
  icon: LucideIcon;
  /** Omitted for items visible to every logged-in user regardless of role (home). */
  access?: { processArea: ProcessArea; minLevel: VpraLevel };
}

// Per-item threshold is a deliberate product choice, not a mechanical ">none"
// derivation: several areas where `employee` genuinely holds "view" (e.g.
// goalsLibrary, careerPath used by salary-scale) are still admin/reference
// tools, not something meaningful for a regular employee to land on from the
// top nav -- so a handful of items require "prepare" or check a narrower,
// more sensitive area than their page's own RLS OR-gate does. `vacancies`
// and `career-path` are left at "view" deliberately: vacancies are
// documented as visible to all staff, and career-path is a reasonable thing
// for anyone to browse for their own progression.
export const navItems: NavItem[] = [
  { segment: "", labelKey: "home", icon: Home },
  { segment: "employees", labelKey: "employees", icon: Users, access: { processArea: "employeeData", minLevel: "view" } },
  { segment: "career-path", labelKey: "careerPath", icon: Route, access: { processArea: "careerPath", minLevel: "view" } },
  // salary-scale's own RLS is "careerPath OR employeeData" (either grants read access),
  // but the nav tab deliberately checks employeeData alone -- full company salary
  // figures are more sensitive than a promotion-path reference, so holding only
  // careerPath=view (like `employee`) isn't enough to surface this as a top-level tab.
  { segment: "salary-scale", labelKey: "salaryScale", icon: Wallet, access: { processArea: "employeeData", minLevel: "view" } },
  { segment: "goals/library", labelKey: "goalLibrary", icon: Target, access: { processArea: "goalsLibrary", minLevel: "prepare" } },
  { segment: "bau-tasks", labelKey: "bauTasks", icon: ListChecks, access: { processArea: "bauTasks", minLevel: "prepare" } },
  { segment: "evaluations", labelKey: "evaluations", icon: ClipboardList, access: { processArea: "evaluation", minLevel: "view" } },
  { segment: "feedback-360", labelKey: "feedback360", icon: MessagesSquare, access: { processArea: "evaluation", minLevel: "prepare" } },
  { segment: "competencies", labelKey: "competencies", icon: Award, access: { processArea: "competencyFramework", minLevel: "view" } },
  { segment: "calibration", labelKey: "calibration", icon: BarChart3, access: { processArea: "calibration", minLevel: "view" } },
  { segment: "promotions", labelKey: "promotions", icon: TrendingUp, access: { processArea: "promotions", minLevel: "view" } },
  { segment: "rewards", labelKey: "rewards", icon: Gift, access: { processArea: "promotions", minLevel: "view" } },
  { segment: "vacancies", labelKey: "vacancies", icon: Briefcase, access: { processArea: "vacancies", minLevel: "view" } },
  { segment: "admin", labelKey: "admin", icon: ShieldCheck, access: { processArea: "userManagement", minLevel: "view" } },
];

/** Pure filter, kept here (not NavBar.tsx) so it stays importable from Vitest without next/navigation. */
export function visibleNavItems(
  items: NavItem[],
  permissions: Partial<Record<ProcessArea, VpraLevel>>
): NavItem[] {
  return items.filter((item) => {
    if (!item.access) return true;
    const level = permissions[item.access.processArea] ?? "none";
    return hasVpraAccess(level, item.access.minLevel);
  });
}

/** `/` for the home item, `/${segment}` for everything else — the locale prefix is added by <Link>. */
export function navItemHref(segment: string): string {
  return segment ? `/${segment}` : "/";
}

/**
 * Home is only active on the exact root; every other item is active on its
 * own path and any nested path under it (`startsWith`), matching how the
 * admin/competencies/etc. sub-routes should keep their parent tab lit.
 */
export function isNavItemActive(segment: string, pathname: string): boolean {
  const href = navItemHref(segment);
  return segment ? pathname.startsWith(href) : pathname === "/";
}
