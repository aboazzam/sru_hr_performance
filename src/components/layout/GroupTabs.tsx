import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { navGroups, navItemHref, visibleNavItems } from "./navItems";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";

/**
 * Top-of-page tab bar for the sidebar groups (الخطة الاستراتيجية / الإدارة /
 * طرق التقييم / نتائج التقييم), per the explicit "العناوين الفرعية تكون على
 * شكل تابات في أعلى الصفحة" instruction (2026-07-24) -- the group's children are NOT
 * nested in the sidebar itself (Sidebar.tsx links straight to the first
 * child), they only ever appear here, added once at the top of every page
 * that belongs to a group.
 *
 * A Server Component (like every other permission-fetching page in this
 * app) rather than a prop drilled from the layout -- these member pages
 * don't share a single layout.tsx (evaluations/competencies/bau-tasks/
 * feedback-360 are plain siblings under (app)/, not nested under one
 * folder), so each page includes <GroupTabs groupKey="..." current="..." />
 * directly rather than inheriting it.
 */
export async function GroupTabs({
  groupKey,
  current,
}: {
  groupKey: "strategicPlan" | "executivePlan" | "administration" | "evaluationMethods" | "evaluationResults" | "recruitment" | "threeSixty";
  current: string;
}) {
  const t = await getTranslations("NavBar");
  const supabase = await createClient();
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;

  const group = navGroups.find((g) => g.groupKey === groupKey);
  if (!group) return null;
  const children = visibleNavItems(group.children, permissions);
  if (children.length === 0) return null;

  return (
    <div className="sru-page-tabs no-print">
      {children.map((child) => (
        <Link
          key={child.segment}
          href={navItemHref(child.segment)}
          className={`sru-page-tab${child.segment === current ? " active" : ""}`}
        >
          <child.icon size={15} aria-hidden />
          {t(child.labelKey)}
        </Link>
      ))}
    </div>
  );
}
