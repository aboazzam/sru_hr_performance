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

export interface NavItem {
  segment: string;
  labelKey: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { segment: "", labelKey: "home", icon: Home },
  { segment: "employees", labelKey: "employees", icon: Users },
  { segment: "career-path", labelKey: "careerPath", icon: Route },
  { segment: "salary-scale", labelKey: "salaryScale", icon: Wallet },
  { segment: "goals/library", labelKey: "goalLibrary", icon: Target },
  { segment: "bau-tasks", labelKey: "bauTasks", icon: ListChecks },
  { segment: "evaluations", labelKey: "evaluations", icon: ClipboardList },
  { segment: "feedback-360", labelKey: "feedback360", icon: MessagesSquare },
  { segment: "competencies", labelKey: "competencies", icon: Award },
  { segment: "calibration", labelKey: "calibration", icon: BarChart3 },
  { segment: "promotions", labelKey: "promotions", icon: TrendingUp },
  { segment: "rewards", labelKey: "rewards", icon: Gift },
  { segment: "vacancies", labelKey: "vacancies", icon: Briefcase },
  { segment: "admin", labelKey: "admin", icon: ShieldCheck },
];

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
