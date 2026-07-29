import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/PrintButton";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Flag } from "lucide-react";

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

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function GoalLibraryPage() {
  const t = await getTranslations("GoalLibraryPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (goal_library_select: check_vpra('goalsLibrary',
  // 'view')). job_family_id is a single, nullable FK -> job_families, so the
  // embed returns a single object or null, not an array — verified directly
  // against the REST API before writing this (same habit as career_path/
  // salary_scale, to avoid repeating the org_units embed bug from the
  // employees list page).
  const { data } = await supabase
    .from("goal_library")
    .select("id, title_ar, title_en, description_ar, default_weight, job_families(name_ar)")
    .is("deleted_at", null)
    .order("title_ar");

  const goals = data as unknown as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    default_weight: number | null;
    job_families: { name_ar: string } | null;
  }> | null;

  // Read-only summary requested directly ("أضفها ضمن تاب بنك الأهداف",
  // 2026-07-29) -- alongside the goal_library catalog above, not replacing
  // the dedicated /kpis/strategic-goals admin screen, which stays the only
  // place to create/edit these. Same RLS-scoped queries as that screen
  // (strategic_goals_select/sub_goals_select) -- a caller with no
  // strategicPlanning access simply sees an empty section here, same
  // "empty means either truly empty or not visible to you" convention used
  // everywhere else in this app.
  const { data: strategicGoalsData } = await supabase
    .from("strategic_goals")
    .select("id, title_ar, target_value, actual_value, unit_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const strategicGoals = (strategicGoalsData ?? []) as StrategicGoalRow[];

  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, target_value, actual_value, unit_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subGoals = (subGoalsData ?? []) as SubGoalRow[];

  // list_org_structure_positions(): SECURITY DEFINER RPC -- see
  // StrategicGoalsPage's own comment (org_structure_positions_select's RLS
  // doesn't cover every role that can reach this page).
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
      <GroupTabs groupKey="strategicPlan" current="goals/library" />
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/goals/assign" className="sru-btn sru-btn-primary">
            {t("assignGoal")}
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Flag size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("strategicSectionHeading")}</h3>
            <span>{t("strategicSectionSubtitle")}</span>
          </div>
        </div>
        {strategicGoals.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("strategicGoalsEmpty")}</p>
        ) : (
          strategicGoals.map((goal) => {
            const goalSubGoals = subGoalsByStrategicGoal.get(goal.id) ?? [];
            return (
              <div key={goal.id} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--sru-border)" }}>
                <strong style={{ fontSize: 14 }}>{goal.title_ar}</strong>
                <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 2, marginBottom: 10 }}>
                  {t("columnTarget")}: {goal.target_value ?? "—"} {goal.unit_ar} · {t("columnActual")}: {goal.actual_value ?? "—"}{" "}
                  {goal.unit_ar}
                  {goal.weight != null ? ` · ${t("columnWeight")}: ${goal.weight}%` : ""}
                </p>
                {goalSubGoals.length === 0 ? (
                  <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("subGoalsEmpty")}</p>
                ) : (
                  <div className="table-scroll">
                    <table className="admin-matrix">
                      <thead>
                        <tr>
                          <th>{t("columnSubGoalTitle")}</th>
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
      </section>

      <h2 className="sru-title" style={{ fontSize: 16, marginBottom: 12 }}>
        {t("libraryHeading")}
      </h2>

      {!goals || goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnJobFamily")}</th>
                  <th>{t("columnDefaultWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal) => (
                  <tr key={goal.id}>
                    <td>
                      {goal.title_ar}
                      {goal.description_ar && (
                        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>
                          {goal.description_ar}
                        </p>
                      )}
                    </td>
                    <td>{goal.job_families?.name_ar ?? t("allJobFamilies")}</td>
                    <td>{goal.default_weight != null ? `${goal.default_weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
