import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

interface StrategicGoalRow {
  id: string;
  title_ar: string;
  weight: number | null;
}

interface SubGoalRow {
  id: string;
  strategic_goal_id: string;
  owner_position_id: string;
  title_ar: string;
  weight: number | null;
}

// 2026-07-30: goals/sub-goals no longer carry an inline KPI -- their
// indicators are `strategic_kpis` rows (many per goal), each with its own
// plan-long target.
interface KpiRow {
  id: string;
  strategic_goal_id: string | null;
  sub_goal_id: string | null;
  title_ar: string;
  unit_ar: string;
  plan_target_value: number | null;
  weight: number | null;
}

// Nav-gated at strategicPlanning>=approve (strategy_admin only) — see
// navItems.ts. `strategic_goals_select`'s RLS itself also lets strategy_admin
// see everything via check_vpra_global('strategicPlanning','view').
//
// This admin screen previously had NO server-side gate of its own — a real
// bug found live in production (2026-07-28): any authenticated user who
// navigated directly to this URL saw the full admin screen, bypassing the
// nav-only gate entirely. The underlying `strategic_goals`/`sub_goals` data
// was never actually exposed to an unauthorized caller (RLS already scoped
// those SELECTs correctly), but per CLAUDE.md §5-A rule 4 ("never rely on
// UI-only protection") this page must check VPRA itself, not just hide its
// own nav link. Mirrors the exact `get_my_permissions` + `hasVpraAccess`
// pattern already established on /admin/settings and /admin/org-structure,
// at the same `approve` bar the nav tab and every write action already use.
export default async function StrategicGoalsPage() {
  const t = await getTranslations("StrategicGoalsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const strategicPlanningLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(strategicPlanningLevel, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // Gate: strategy_admin must set up vision/mission/values before creating
  // any strategic goal (requested directly, 2026-07-28) -- checked here too,
  // not just on the create-goal page, so the "add goal" button itself
  // reflects readiness instead of leading to a dead end.
  const { data: identity } = await supabase.from("strategic_identity").select("vision_ar, mission_ar").maybeSingle();
  const { count: valuesCount } = await supabase
    .from("strategic_values")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const identityComplete = Boolean(identity?.vision_ar?.trim() && identity?.mission_ar?.trim() && (valuesCount ?? 0) > 0);

  const { data: goalsData } = await supabase
    .from("strategic_goals")
    .select("id, title_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const goals = (goalsData ?? []) as StrategicGoalRow[];

  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subGoals = (subGoalsData ?? []) as SubGoalRow[];

  const { data: kpisData } = await supabase
    .from("strategic_kpis")
    .select("id, strategic_goal_id, sub_goal_id, title_ar, unit_ar, plan_target_value, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const kpis = (kpisData ?? []) as KpiRow[];

  const kpisByGoal = new Map<string, KpiRow[]>();
  const kpisBySubGoal = new Map<string, KpiRow[]>();
  for (const k of kpis) {
    const key = k.strategic_goal_id ?? k.sub_goal_id;
    if (!key) continue;
    const map = k.strategic_goal_id ? kpisByGoal : kpisBySubGoal;
    const list = map.get(key) ?? [];
    list.push(k);
    map.set(key, list);
  }

  // list_org_structure_positions(): SECURITY DEFINER RPC, since
  // org_structure_positions_select's own RLS (orgStructure=view) doesn't
  // include strategy_admin — see the sub-goal creation page's own comment.
  const { data: positions } = await supabase.rpc("list_org_structure_positions");
  const positionNameById = new Map(((positions ?? []) as Array<{ id: string; name_ar: string }>).map((p) => [p.id, p.name_ar]));

  const subGoalsByStrategicGoal = new Map<string, SubGoalRow[]>();
  for (const sg of subGoals) {
    const list = subGoalsByStrategicGoal.get(sg.strategic_goal_id) ?? [];
    list.push(sg);
    subGoalsByStrategicGoal.set(sg.strategic_goal_id, list);
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="strategicPlan" current="kpis/strategic-goals" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/kpis/strategic-identity" className="sru-btn">
            {t("identityLinkButton")}
          </Link>
          {identityComplete && (
            <Link href="/kpis/strategic-goals/new" className="sru-btn sru-btn-primary">
              {t("addGoalButton")}
            </Link>
          )}
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!identityComplete && (
        <div className="sru-card" style={{ padding: 16, marginBottom: 20, borderColor: "var(--sru-purple)" }}>
          <p style={{ fontSize: 13 }}>
            {t("identityGateMessage")}{" "}
            <Link href="/kpis/strategic-identity" style={{ color: "var(--color-primary)", fontWeight: 700 }}>
              {t("identityLinkButton")}
            </Link>
          </p>
        </div>
      )}

      {goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        goals.map((goal) => {
          const goalSubGoals = subGoalsByStrategicGoal.get(goal.id) ?? [];
          return (
            <div key={goal.id} className="sru-card" style={{ marginBottom: 24, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{goal.title_ar}</strong>
                  {goal.weight != null && (
                    <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>
                      {t("columnWeight")}: {goal.weight}%
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Link href={`/kpis/manage-kpis?goalId=${goal.id}`} className="sru-btn" style={{ fontSize: 12 }}>
                    {t("manageKpisButton")}
                  </Link>
                  <Link href={`/kpis/strategic-goals/${goal.id}/sub-goals/new`} className="sru-btn" style={{ fontSize: 12 }}>
                    {t("addSubGoalButton")}
                  </Link>
                </div>
              </div>

              <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{t("kpisHeading")}</h3>
              {(kpisByGoal.get(goal.id) ?? []).length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("kpisEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnKpi")}</th>
                        <th>{t("columnUnit")}</th>
                        <th>{t("columnPlanTarget")}</th>
                        <th>{t("columnWeight")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kpisByGoal.get(goal.id) ?? []).map((k) => (
                        <tr key={k.id}>
                          <td>{k.title_ar}</td>
                          <td>{k.unit_ar}</td>
                          <td>{k.plan_target_value ?? "—"}</td>
                          <td>{k.weight != null ? `${k.weight}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{t("subGoalsHeading")}</h3>
              {goalSubGoals.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("subGoalsEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnTitle")}</th>
                        <th>{t("columnOwner")}</th>
                        <th>{t("columnKpi")}</th>
                        <th>{t("columnWeight")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {goalSubGoals.map((sg) => (
                        <tr key={sg.id}>
                          <td>{sg.title_ar}</td>
                          <td>{positionNameById.get(sg.owner_position_id) ?? "—"}</td>
                          <td>
                            {(kpisBySubGoal.get(sg.id) ?? []).length === 0
                              ? "—"
                              : (kpisBySubGoal.get(sg.id) ?? [])
                                  .map((k) => `${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})`)
                                  .join("، ")}
                          </td>
                          <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                          <td>
                            <Link
                              href={`/kpis/manage-kpis?subGoalId=${sg.id}`}
                              className="sru-btn"
                              style={{ fontSize: 11.5, padding: "4px 10px" }}
                            >
                              {t("manageKpisButton")}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
