import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

interface StrategicGoalRow {
  id: string;
  title_ar: string;
  target_value: number | null;
  actual_value: number | null;
  unit_ar: string;
  weight: number | null;
}

interface SubGoalRow {
  id: string;
  strategic_goal_id: string;
  owner_position_id: string;
  title_ar: string;
  target_value: number | null;
  actual_value: number | null;
  unit_ar: string;
  weight: number | null;
}

// Nav-gated at strategicPlanning>=approve (strategy_admin only) — see
// navItems.ts. `strategic_goals_select`'s RLS itself also lets strategy_admin
// see everything via check_vpra_global('strategicPlanning','view').
export default async function StrategicGoalsPage() {
  const t = await getTranslations("StrategicGoalsPage");
  const supabase = await createClient();

  const { data: goalsData } = await supabase
    .from("strategic_goals")
    .select("id, title_ar, target_value, actual_value, unit_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const goals = (goalsData ?? []) as StrategicGoalRow[];

  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, target_value, actual_value, unit_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subGoals = (subGoalsData ?? []) as SubGoalRow[];

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <Link href="/kpis/strategic-goals/new" className="sru-btn sru-btn-primary">
          {t("addGoalButton")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        goals.map((goal) => {
          const goalSubGoals = subGoalsByStrategicGoal.get(goal.id) ?? [];
          return (
            <div key={goal.id} className="sru-card" style={{ marginBottom: 24, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{goal.title_ar}</strong>
                  <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
                    {t("columnTarget")}: {goal.target_value ?? "—"} {goal.unit_ar} · {t("columnActual")}:{" "}
                    {goal.actual_value ?? "—"} {goal.unit_ar}
                    {goal.weight != null ? ` · ${t("columnWeight")}: ${goal.weight}%` : ""}
                  </p>
                </div>
                <Link href={`/kpis/strategic-goals/${goal.id}/sub-goals/new`} className="sru-btn" style={{ fontSize: 13 }}>
                  {t("addSubGoalButton")}
                </Link>
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{t("subGoalsHeading")}</h3>
              {goalSubGoals.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("subGoalsEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("columnTitle")}</th>
                        <th>{t("columnOwner")}</th>
                        <th>{t("columnTarget")}</th>
                        <th>{t("columnActual")}</th>
                        <th>{t("columnWeight")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goalSubGoals.map((sg) => (
                        <tr key={sg.id}>
                          <td>{sg.title_ar}</td>
                          <td>{positionNameById.get(sg.owner_position_id) ?? "—"}</td>
                          <td>
                            {sg.target_value ?? "—"} {sg.unit_ar}
                          </td>
                          <td>
                            {sg.actual_value ?? "—"} {sg.unit_ar}
                          </td>
                          <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
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
