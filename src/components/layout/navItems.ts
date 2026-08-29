// Deliberately has zero dependency on next-intl/next-navigation. Sidebar.tsx
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
  ListChecks,
  ClipboardList,
  ClipboardCheck,
  Award,
  BarChart3,
  ShieldCheck,
  MessagesSquare,
  Briefcase,
  Network,
  UserCog,
  KeyRound,
  Palette,
  FileBarChart,
  Sparkles,
  Activity,
  Settings,
  Gauge,
  Compass,
  CalendarRange,
  UserPlus,
  TrendingUp,
  Megaphone,
  Globe,
  Building2,
} from "lucide-react";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

export interface NavItem {
  segment: string;
  labelKey: string;
  icon: LucideIcon;
  /**
   * Item is visible if the caller meets AT LEAST ONE of these (OR) — a plain
   * array of one is the common case, matching every item declared below
   * except "employees" (2026-07-27: a manager/deputy with real direct
   * reports but no `employeeData` grant, only the narrower
   * `employeeDataSubordinates`, correctly saw their team on the page itself
   * via RLS but the nav tab never showed at all — it only ever checked
   * `employeeData`). Omit entirely for items visible to every logged-in
   * user regardless of role (home).
   */
  access?: Array<{ processArea: ProcessArea; minLevel: VpraLevel }>;
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
//
// 2026-07-24: converted from one flat 14-item list to this shorter flat list
// (top-level, ungrouped items) plus `navGroups` below for the three explicit
// groups the project owner requested (الإدارة / طرق التقييم / نتائج
// التقييم). Segments that moved into a group (admin, evaluations,
// competencies, bau-tasks, feedback-360) are no longer here.
export const navItems: NavItem[] = [
  { segment: "", labelKey: "home", icon: Home },
  // No `access` gate (2026-07-25): the dashboard itself is reachable by
  // every logged-in user, like Home/Profile -- its CONTENT is what varies
  // per permission (each card checks its own relevant process area), not
  // whether the page loads at all. Previously gated behind a standalone
  // `reports` process area seeded empty; that made the whole page invisible
  // to everyone until explicitly granted, the opposite of "شخصي لكل يوزر".
  { segment: "reports", labelKey: "reports", icon: FileBarChart },
  // Either a broad employeeData grant OR the narrower "my subordinates"
  // grant unlocks the tab -- see the NavItem.access doc comment above for
  // the real report this fixes.
  {
    segment: "employees",
    labelKey: "employees",
    icon: Users,
    access: [
      { processArea: "employeeData", minLevel: "view" },
      { processArea: "employeeDataSubordinates", minLevel: "view" },
    ],
  },
  { segment: "career-path", labelKey: "careerPath", icon: Route, access: [{ processArea: "careerPath", minLevel: "view" }] },
  // salary-scale's own RLS is "careerPath OR employeeData" (either grants read access),
  // but the nav tab deliberately checks employeeData alone -- full company salary
  // figures are more sensitive than a promotion-path reference, so holding only
  // careerPath=view (like `employee`) isn't enough to surface this as a top-level tab.
  { segment: "salary-scale", labelKey: "salaryScale", icon: Wallet, access: [{ processArea: "employeeData", minLevel: "view" }] },
  { segment: "calibration", labelKey: "calibration", icon: BarChart3, access: [{ processArea: "calibration", minLevel: "view" }] },
  // 2026-08-04: "vacancies" moved out of this flat list into the new
  // "التوظيف" group below ("والثالث اسمه الشواغر — وهذا تضع فيه الجزء
  // الجاهز من شواغر"); the page itself is unchanged.
  //
  // 2026-08-28: "competencies" moved OUT of the "طرق التقييم" (evaluationMethods)
  // group and back to a standalone top-level item ("ضع موديول الجدارات على
  // السايدبار") -- the project owner's own reasoning: the "الأنشطة" that
  // group used to bundle already live in الخطة الاستراتيجية/الخطة التنفيذية,
  // and "المهام التشغيلية" (bau-tasks) is a department-manager concern, so
  // grouping competencies alongside them under one collapsed sidebar row no
  // longer made sense for something the project owner wants directly
  // visible. Same access gate as before (competencyFramework>=view); the
  // page itself no longer renders a GroupTabs bar, matching every other
  // top-level item here (reports/employees/career-path/etc., none of which
  // render one either).
  { segment: "competencies", labelKey: "competencies", icon: Award, access: [{ processArea: "competencyFramework", minLevel: "view" }] },
];

export interface NavGroup {
  groupKey: string;
  labelKey: string;
  icon: LucideIcon;
  children: NavItem[];
}

// Three groups requested 2026-07-24, each rendered as ONE sidebar entry
// (linking to its first visible child) with its children appearing as a tab
// bar at the top of every page inside the group (GroupTabs.tsx) -- not
// nested inside the sidebar itself, per the explicit "العناوين الفرعية تكون
// على شكل تابات في أعلى الصفحة" instruction.
//
// 2026-07-25: "reports" briefly lived here gated on its own `reports`
// process area, then moved out entirely to the top-level `navItems` above
// as a personalized, ungated dashboard (see that item's own comment) --
// evaluationResults keeps just "recommendations" either way.
export const navGroups: NavGroup[] = [
  // "الخطة الاستراتيجية" (2026-07-28): these three were previously separate
  // top-level items (الأهداف الاستراتيجية / مؤشرات الأداء / بنك الأهداف) —
  // combined into one sidebar row per the explicit "اجمعها كلها في موديول
  // واحد" request, since they're really one strategic-planning module (goal
  // library feeds strategic/sub-goal titles, which cascade into KPIs).
  {
    groupKey: "strategicPlan",
    labelKey: "strategicPlan",
    icon: Compass,
    children: [
      // "قائمة الخطط" (2026-08-01): the plans-list + per-plan detail page,
      // the new landing point for this group ("اذا ضغطت زر الخطة
      // الاستراتيجية في سايدبار تطلع لي قائمة بالخطط الاستراتيجية"). No
      // `access` gate, same "reports"/identity precedent -- browsing which
      // plans exist and opening one is for all staff; only creating a new
      // plan stays gated at strategicPlanning>='approve' on the page itself.
      { segment: "kpis/plans", labelKey: "strategicPlans", icon: CalendarRange },
      // "الأهداف المسندة" (renamed 2026-07-29, was "مؤشرات الأداء" -- the
      // page's own content already matched this description exactly:
      // goals/targets cascaded down TO the caller, which they in turn
      // cascade further down to whoever reports to them). No `access` gate,
      // same "reports" precedent -- real access is entirely row-level
      // (org_structure_assignments ownership / being the assigned employee
      // via strategic_goals/sub_goals/targets RLS), not a flat
      // role_permissions grant most roles never hold. Gating this on
      // `strategicPlanning` would hide it from everyone but
      // strategy_admin/ceo even though real position-holders genuinely
      // have their own cascaded data to see. Since this child has no
      // gate, the whole group is always visible to every logged-in user.
      //
      // 2026-08-01: "الرؤية والرسالة والقيم" / "الأهداف الاستراتيجية" /
      // "بنك الأهداف" were removed from this top-level tab bar per direct
      // feedback ("لا تظهر العناوين الاخرى ... لأن لكل لها عناوينها الخاص
      // بها") -- each now lives ONLY as a tab inside the per-plan detail
      // page (`/kpis/plans/[id]`), which can't be represented as a static
      // NavItem segment here (GroupTabs has no notion of the current plan
      // id). `kpis/strategic-identity` and `kpis/strategic-goals` still
      // exist as standalone routes reached from other screens (the
      // manage-KPIs flow); `goals/library` was deleted outright on
      // 2026-08-29 — nothing had linked to it since this tab was removed,
      // so it was a page no one could reach.
      //
      // 2026-08-20: "الأهداف المسندة" (`kpis`) moved OUT of this group into
      // the new "الخطة التنفيذية" module below, per the explicit "تنقل تاب
      // الاهداف المسندة وبنك الاهداف الى موديول جديد بمسمى الخطة
      // التنفيذية". This group is now the plans list alone — everything
      // else already lives as tabs inside a plan.
    ],
  },
  // "الخطة التنفيذية" (2026-08-20): the operational face of a strategic
  // plan. Its first tab mirrors the strategic-plans list ("اول تاب شبيه
  // بقائمة الخطط الاستراتيجية"), and it now owns "الأهداف المسندة", moved
  // here out of the strategic-plan group. No `access` gate on either child,
  // matching `kpis/plans`: browsing is for everyone and creating is gated
  // on the page itself.
  {
    groupKey: "executivePlan",
    labelKey: "executivePlan",
    icon: ClipboardCheck,
    children: [
      { segment: "operational-plans", labelKey: "executivePlans", icon: CalendarRange },
      // 2026-08-20: replaces "الأهداف المسندة" (`kpis`) here — "ادمج بنك
      // الأهداف مع الأهداف المسندة بحيث يكون العنوان اسناد المبادرات". The
      // /kpis page still exists and is still reachable directly; it just no
      // longer occupies this tab. Ungated for the same reason as the plans
      // lists: reading is decided row-by-row by each initiative's own RLS,
      // and assigning is gated on the page itself.
      { segment: "initiative-assignments", labelKey: "initiativeAssignments", icon: Gauge },
    ],
  },
  {
    groupKey: "administration",
    labelKey: "administration",
    icon: ShieldCheck,
    children: [
      { segment: "admin/org-structure", labelKey: "orgStructure", icon: Network, access: [{ processArea: "orgStructure", minLevel: "view" }] },
      // 2026-08-29: the org units screen joins this group between the org
      // chart and staffing, per direct request. It reads the org_units table
      // itself now (it used to render a copy transcribed into the source
      // tree), so it belongs beside the structure screens rather than
      // floating unreachable with no nav entry at all.
      { segment: "org-units", labelKey: "orgUnits", icon: Building2, access: [{ processArea: "employeeData", minLevel: "view" }] },
      { segment: "admin/org-structure/staffing", labelKey: "staffing", icon: UserCog, access: [{ processArea: "staffing", minLevel: "view" }] },
      { segment: "admin", labelKey: "permissions", icon: KeyRound, access: [{ processArea: "userManagement", minLevel: "view" }] },
      { segment: "admin/identity", labelKey: "identity", icon: Palette, access: [{ processArea: "identity", minLevel: "view" }] },
      // Gated at 'approve' (not 'view', unlike this group's other tabs) --
      // 2026-07-25 request: per-user login timestamps are more sensitive
      // than most administration data, so this deliberately sits at the
      // same tier as the role editor itself, not just "can see admin stuff".
      { segment: "admin/user-activity", labelKey: "userActivity", icon: Activity, access: [{ processArea: "userManagement", minLevel: "approve" }] },
      // 2026-07-26: "إعدادات النظام" (System Settings) tab, starting with a
      // configurable display timezone. Gated at `systemSettings>=view`,
      // seeded super_admin-only (same narrow tier as `identity`) -- see
      // that migration's own doc comment for why.
      { segment: "admin/settings", labelKey: "systemSettings", icon: Settings, access: [{ processArea: "systemSettings", minLevel: "view" }] },
    ],
  },
  {
    groupKey: "evaluationMethods",
    labelKey: "evaluationMethods",
    icon: ClipboardList,
    children: [
      { segment: "evaluations", labelKey: "performance", icon: ClipboardList, access: [{ processArea: "evaluation", minLevel: "view" }] },
      // "competencies" moved out to the top-level navItems above (2026-08-28).
      { segment: "bau-tasks", labelKey: "bauTasks", icon: ListChecks, access: [{ processArea: "bauTasks", minLevel: "prepare" }] },
      { segment: "feedback-360", labelKey: "feedback360", icon: MessagesSquare, access: [{ processArea: "evaluation", minLevel: "prepare" }] },
    ],
  },
  // "التوظيف" (2026-08-04): a new module bundling the hiring lifecycle —
  // the (not yet designed) recruitment plan, promotions, and the already-
  // built vacancies screen ("وهذا تضع فيه الجزء الجاهز من شواغر"). Only
  // the first tab needed a new process area (`recruitmentPlan`); the other
  // two reuse `promotions`/`vacancies`, which already gate their own real
  // tables' RLS — see 20260804000001's header for the promotions/rewards/
  // recommendations coupling that reuse implies.
  {
    groupKey: "recruitment",
    labelKey: "recruitment",
    icon: UserPlus,
    children: [
      { segment: "recruitment/plan", labelKey: "recruitmentPlan", icon: CalendarRange, access: [{ processArea: "recruitmentPlan", minLevel: "view" }] },
      // 2026-08-07: طلبات الاحتياج — the demand side of the plan. Two access
      // entries, OR-ed by `visibleNavItems`: a department raises and reads
      // its own requests via `recruitmentPlan`, while a finance reviewer
      // reaches them through `recruitmentBudget` alone, holding no
      // `recruitmentPlan` grant at all (mirrors the SELECT policy exactly).
      { segment: "recruitment/requests", labelKey: "recruitmentRequests", icon: ClipboardList, access: [{ processArea: "recruitmentRequests", minLevel: "view" }, { processArea: "recruitmentBudget", minLevel: "view" }] },
      { segment: "promotions", labelKey: "promotions", icon: TrendingUp, access: [{ processArea: "promotions", minLevel: "view" }] },
      { segment: "vacancies", labelKey: "vacancies", icon: Briefcase, access: [{ processArea: "vacancies", minLevel: "view" }] },
      // 2026-08-04: vacancies advertised from the الشواغر tab's megaphone
      // icon (`vacancies.announced_at`). Same `vacancies>=view` gate as the
      // tab it is fed from — internal postings are documented as visible to
      // all staff, so an advertised one certainly is.
      { segment: "recruitment/announced", labelKey: "announcedJobs", icon: Megaphone, access: [{ processArea: "vacancies", minLevel: "view" }] },
      // 2026-08-05: the outward-facing list — advertised vacancies whose
      // publication window is actually open right now. Same `vacancies>=view`
      // gate as the tab that feeds it.
      // 2026-08-07: البوابة صارت بوابتين — داخلية للمنسوبين وخارجية
      // للمتقدّمين من الخارج — ولها مجالها `recruitmentPortal` بدل
      // `vacancies`، فيمكن منح تصفّح البوابة دون إدارة الشواغر.
      { segment: "recruitment/portal", labelKey: "recruitmentPortalInternal", icon: Globe, access: [{ processArea: "recruitmentPortal", minLevel: "view" }] },
      { segment: "recruitment/portal/external", labelKey: "recruitmentPortalExternal", icon: Globe, access: [{ processArea: "recruitmentPortal", minLevel: "view" }] },
    ],
  },
  {
    groupKey: "evaluationResults",
    labelKey: "evaluationResults",
    icon: FileBarChart,
    children: [
      // 2026-08-20: moved off `promotions` onto its own area — the two were
      // coupled only because rewards/recommendations reused that area's
      // policies, which the split ended.
      { segment: "recommendations", labelKey: "recommendations", icon: Sparkles, access: [{ processArea: "rewardsAndRecommendations", minLevel: "view" }] },
    ],
  },
];

/** Pure filter, kept here (not Sidebar.tsx) so it stays importable from Vitest without next/navigation. */
export function visibleNavItems(
  items: NavItem[],
  permissions: Partial<Record<ProcessArea, VpraLevel>>
): NavItem[] {
  return items.filter((item) => {
    if (!item.access || item.access.length === 0) return true;
    return item.access.some(({ processArea, minLevel }) =>
      hasVpraAccess(permissions[processArea] ?? "none", minLevel)
    );
  });
}

/** A group is visible if at least one child is visible for this permission set. */
export function visibleNavGroups(
  groups: NavGroup[],
  permissions: Partial<Record<ProcessArea, VpraLevel>>
): Array<NavGroup & { children: NavItem[] }> {
  return groups
    .map((group) => ({ ...group, children: visibleNavItems(group.children, permissions) }))
    .filter((group) => group.children.length > 0);
}

/** `/` for the home item, `/${segment}` for everything else — the locale prefix is added by <Link>. */
export function navItemHref(segment: string): string {
  return segment ? `/${segment}` : "/";
}

/**
 * The sidebar collapses a whole group into one row linking to its first
 * visible child, labeled with the group's own generic name (e.g. "الإدارة"
 * for a caller who can reach الهيكل التنظيمي/التسكين/الصلاحيات/الهوية).
 * Real feedback (2026-07-25): when a caller's permissions leave exactly ONE
 * child visible in that group (e.g. `orgStructure=view` and nothing else in
 * "الإدارة" — see the org-structure page's own view-vs-prepare split), the
 * generic group label reads as too broad for what's actually behind it —
 * use that one child's own label instead, so the sidebar accurately
 * reflects "this row is really just الهيكل التنظيمي," not administration
 * at large.
 */
export function sidebarGroupLabelKey(group: NavGroup & { children: NavItem[] }): string {
  // 2026-08-20: the substitution applies only when PERMISSIONS narrowed the
  // group to one child -- compare against what the group actually declares.
  // Without this, a module that genuinely has a single child (the strategic
  // plan, once "الأهداف المسندة" moved to the executive-plan module) lost its
  // own name in the sidebar and read "قائمة الخطط", which is both less
  // informative and ambiguous next to the new module. Caught live.
  const declared = navGroups.find((g) => g.groupKey === group.groupKey)?.children.length ?? group.children.length;
  const narrowedByPermissions = declared > 1 && group.children.length === 1;
  return narrowedByPermissions ? group.children[0].labelKey : group.labelKey;
}

// Flattened list of every real segment in the app (top-level items + every
// group's children), used only to disambiguate overlapping prefixes below —
// e.g. "admin" and "admin/org-structure" are now separate, sibling nav
// entries (not a page-and-its-sub-route relationship), so a naive
// `pathname.startsWith("/admin")` would wrongly mark "الصلاحيات" active
// while actually on "الهيكل التنظيمي".
const allKnownSegments: string[] = [
  ...navItems.map((i) => i.segment),
  ...navGroups.flatMap((g) => g.children.map((c) => c.segment)),
].filter((s) => s !== "");

/**
 * Home is only active on the exact root; every other item is active on its
 * own path and any nested sub-route under it (`startsWith`) — UNLESS a more
 * specific known segment also matches, in which case that longer segment
 * wins (longest-prefix-wins), so sibling entries sharing a URL prefix (the
 * "الإدارة" group's four children all live under /admin/*) never both
 * appear active at once.
 */
export function isNavItemActive(segment: string, pathname: string): boolean {
  if (segment === "") return pathname === "/";
  const href = navItemHref(segment);
  if (pathname !== href && !pathname.startsWith(href + "/")) return false;

  const moreSpecificMatchExists = allKnownSegments.some((other) => {
    if (other === segment || other.length <= segment.length) return false;
    const otherHref = navItemHref(other);
    return pathname === otherHref || pathname.startsWith(otherHref + "/");
  });
  return !moreSpecificMatchExists;
}

/** A group is active if the current path matches any of its (unfiltered) children. */
export function isNavGroupActive(group: NavGroup, pathname: string): boolean {
  return group.children.some((child) => isNavItemActive(child.segment, pathname));
}
