import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { ManageKpisPanel, type AnnualTargetItem, type CycleItem, type KpiItem } from "@/components/ManageKpisPanel";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

/**
 * One screen for both parents a KPI can hang off (strategic goal or
 * sub-goal), selected by query param rather than two near-identical nested
 * routes -- the KPI shape, its annual targets and every action are
 * identical for both, and strategic_kpis models them as one table with an
 * XOR precisely because they are the same thing at two tiers.
 */
export default async function ManageKpisPage({
  searchParams,
}: {
  searchParams: Promise<{ goalId?: string; subGoalId?: string }>;
}) {
  const { goalId, subGoalId } = await searchParams;
  const t = await getTranslations("ManageKpisPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(level, "view");
  // Goals and KPIs change only by an approve-level decision -- the project
  // owner's "لا تتغير ... الا بقرار من صاحب الصلاحية". Matches
  // strategic_kpis_insert/_update's own bar (20260730000001).
  const canEdit = hasVpraAccess(level, "approve");

  // Exactly one parent, mirroring strategic_kpis_parent_xor.
  if (!canView || Boolean(goalId) === Boolean(subGoalId)) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{canView ? t("errorInvalidParent") : t("errorForbidden")}</p>
      </div>
    );
  }

  const parentKind: "goal" | "subGoal" = goalId ? "goal" : "subGoal";
  const parentId = (goalId ?? subGoalId)!;

  const { data: parent } = goalId
    ? await supabase.from("strategic_goals").select("title_ar").eq("id", goalId).maybeSingle()
    : await supabase.from("sub_goals").select("title_ar").eq("id", subGoalId!).maybeSingle();

  const kpiFilter = goalId ? { strategic_goal_id: goalId } : { sub_goal_id: subGoalId! };
  const { data: kpisData } = await supabase
    .from("strategic_kpis")
    .select("id, title_ar, title_en, unit_ar, unit_en, plan_target_value, weight")
    .match(kpiFilter)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const kpis = (kpisData ?? []) as KpiItem[];

  // Cycles supply the annual measurement periods ("مستهدف سنوي").
  const { data: cyclesData } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const cycles = (cyclesData ?? []) as CycleItem[];

  const kpiIds = kpis.map((k) => k.id);
  const { data: annualData } =
    kpiIds.length > 0
      ? await supabase
          .from("kpi_annual_targets")
          .select("kpi_id, cycle_id, target_value, actual_value")
          .in("kpi_id", kpiIds)
          .is("deleted_at", null)
      : { data: [] };
  const annualTargets = (annualData ?? []) as AnnualTargetItem[];

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
        <strong>{parentKind === "goal" ? t("goalLabel") : t("subGoalLabel")}:</strong> {parent?.title_ar ?? "—"}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ManageKpisPanel
        parentKind={parentKind}
        parentId={parentId}
        kpis={kpis}
        cycles={cycles}
        annualTargets={annualTargets}
        canEdit={canEdit}
      />
    </div>
  );
}
