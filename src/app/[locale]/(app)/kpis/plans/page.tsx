import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewStrategicPlanForm } from "@/components/NewStrategicPlanForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { StrategicPlanCard, type StrategicPlanCardData } from "@/components/StrategicPlanCard";

interface PlanRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  start_year: number;
  end_year: number;
}

// Auth is enforced centrally by (app)/layout.tsx. Real write authorization
// is strategic_plans_insert's own check_vpra_global('strategicPlanning',
// 'approve') (20260730000001), strategy_admin-only.
//
// Viewing is deliberately UNGATED (2026-08-01, same "vision/mission opened
// to everyone" precedent from 20260730000004): this page previously
// required strategicPlanning>='view', which only 2-3 roles hold, making it
// an unreachable dead end for everyone else -- directly contradicting the
// explicit request that clicking the sidebar's "الخطة الاستراتيجية" button
// should always open "قائمة بالخطط الاستراتيجية". Only the create-plan
// form stays gated at 'approve', matching strategic_plans_insert's own RLS
// (per CLAUDE.md §5-A rule 4, not UI-only protection).
export default async function StrategicPlansPage() {
  const t = await getTranslations("StrategicPlansPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(level, "approve");

  const { data } = await supabase
    .from("strategic_plans")
    .select("id, name_ar, name_en, start_year, end_year")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  const plans = (data ?? []) as PlanRow[];

  const [{ data: goalRows }, { data: initiativeRows }, { data: programRows }] = await Promise.all([
    supabase.from("strategic_goals").select("id, plan_id").is("deleted_at", null),
    supabase
      .from("strategic_initiatives")
      .select("plan_id, progress_percent, status_code")
      .is("deleted_at", null),
    supabase.from("strategic_programs").select("plan_id").is("deleted_at", null),
  ]);

  // KPIs hang off a goal or a sub-goal, never off the plan directly, so the
  // plan's own KPIs are reached through its goals. Read via the caller's own
  // client like everything else here: a KPI they cannot see simply does not
  // count toward the number they are shown.
  const goalsById = ((goalRows ?? []) as Array<{ id: string; plan_id: string }>).reduce((map, g) => {
    map.set(g.id, g.plan_id);
    return map;
  }, new Map<string, string>());
  const { data: subGoalRows } =
    goalsById.size > 0
      ? await supabase
          .from("sub_goals")
          .select("id, strategic_goal_id")
          .in("strategic_goal_id", [...goalsById.keys()])
          .is("deleted_at", null)
      : { data: [] };
  const planBySubGoal = ((subGoalRows ?? []) as Array<{ id: string; strategic_goal_id: string }>).reduce((map, sg) => {
    const planId = goalsById.get(sg.strategic_goal_id);
    if (planId) map.set(sg.id, planId);
    return map;
  }, new Map<string, string>());

  const { data: kpiRows } = await supabase
    .from("strategic_kpis")
    .select("id, weight, plan_target_value, strategic_goal_id, sub_goal_id")
    .is("deleted_at", null);
  const kpis = (kpiRows ?? []) as Array<{
    id: string;
    weight: number | string | null;
    plan_target_value: number | string | null;
    strategic_goal_id: string | null;
    sub_goal_id: string | null;
  }>;

  // The latest recorded actual per KPI. Annual targets carry the actuals; a
  // KPI with none is simply unmeasured, which planAchievement() reports
  // rather than scoring as zero.
  const { data: annualRows } = await supabase
    .from("kpi_annual_targets")
    .select("kpi_id, actual_value, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const latestActualByKpi = new Map<string, number | string | null>();
  for (const row of (annualRows ?? []) as Array<{ kpi_id: string; actual_value: number | string | null }>) {
    if (row.actual_value != null) latestActualByKpi.set(row.kpi_id, row.actual_value);
  }

  function planIdOfKpi(kpi: (typeof kpis)[number]): string | undefined {
    if (kpi.strategic_goal_id) return goalsById.get(kpi.strategic_goal_id);
    if (kpi.sub_goal_id) return planBySubGoal.get(kpi.sub_goal_id);
    return undefined;
  }
  function countFor(rows: Array<{ plan_id: string }> | null, planId: string): number {
    return (rows ?? []).filter((r) => r.plan_id === planId).length;
  }
  const initiativeRowsTyped = (initiativeRows ?? []) as Array<{
    plan_id: string;
    progress_percent: number | string | null;
    status_code: string | null;
  }>;

  // One "today" for every card, taken on the server: a per-card new Date()
  // could straddle midnight mid-render.
  const todayIso = new Date().toISOString().slice(0, 10);
  const cards: StrategicPlanCardData[] = plans.map((plan) => ({
    id: plan.id,
    nameAr: plan.name_ar,
    nameEn: plan.name_en,
    startYear: plan.start_year,
    endYear: plan.end_year,
    goalCount: countFor(goalRows as Array<{ plan_id: string }> | null, plan.id),
    initiativeCount: initiativeRowsTyped.filter((r) => r.plan_id === plan.id).length,
    programCount: countFor(programRows as Array<{ plan_id: string }> | null, plan.id),
    kpis: kpis
      .filter((k) => planIdOfKpi(k) === plan.id)
      .map((k) => ({
        weight: k.weight,
        targetValue: k.plan_target_value,
        actualValue: latestActualByKpi.get(k.id) ?? null,
      })),
    initiatives: initiativeRowsTyped
      .filter((r) => r.plan_id === plan.id)
      .map((r) => ({ progressPercent: r.progress_percent, statusCode: r.status_code })),
  }));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="strategicPlan" current="kpis/plans" />
      {/* Trigger sits to the LEFT of the title and slightly below it
          (2026-08-19 request) -- alignItems: flex-end lines it up with the
          subtitle rather than the heading, and it wraps underneath on
          narrow screens. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canCreate && (
          <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
            <NewStrategicPlanForm />
          </div>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {plans.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {cards.map((plan) => (
            <StrategicPlanCard key={plan.id} plan={plan} canManage={canCreate} todayIso={todayIso} />
          ))}
        </div>
      )}
    </div>
  );
}
