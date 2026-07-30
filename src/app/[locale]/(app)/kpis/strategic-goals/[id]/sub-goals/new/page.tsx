import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewSubGoalForm } from "@/components/NewSubGoalForm";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — the real write gate is
// sub_goals_insert's own RLS (strategy_admin only). This page-level check is
// an addition, not a replacement: a real bug found live in production
// (2026-07-28) showed this entire create form (position picker, title,
// target, unit, weight, submit) to any authenticated user who hit this URL
// directly, since only the nav link for the parent screen was gated —
// submitting would have correctly failed server-side via RLS, but per
// CLAUDE.md §5-A rule 4 ("never rely on UI-only protection") the page itself
// must not render the form for a caller who can never legitimately submit it.
export default async function NewSubGoalPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id: strategicGoalId } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewSubGoalPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const strategicPlanningLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(strategicPlanningLevel, "approve");

  if (!canCreate) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data: strategicGoal } = await supabase
    .from("strategic_goals")
    .select("id, title_ar")
    .eq("id", strategicGoalId)
    .maybeSingle();

  // list_org_structure_positions(): a SECURITY DEFINER RPC, not the
  // caller's RLS-respecting client -- org_structure_positions_select
  // requires orgStructure=view (hr_admin/super_admin only), which
  // strategy_admin doesn't hold, so a plain table query here would come
  // back empty for the very role this page is built for.
  const { data: positions } = await supabase.rpc("list_org_structure_positions");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/kpis/strategic-goals"
        className="sru-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backButton")}
      </Link>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <p style={{ fontSize: 14, marginTop: 8, marginBottom: 20 }}>
        <strong>{t("strategicGoalLabel")}:</strong> {strategicGoal?.title_ar ?? "—"}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewSubGoalForm
        locale={locale}
        strategicGoalId={strategicGoalId}
        positions={(positions ?? []) as Array<{ id: string; name_ar: string }>}
      />
    </div>
  );
}
