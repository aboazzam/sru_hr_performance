import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { UpdateProgressForm } from "@/components/UpdateProgressForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

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

interface TargetRow {
  id: string;
  sub_goal_id: string;
  assigned_position_id: string | null;
  assigned_employee_id: string | null;
  title_ar: string;
  target_value: number;
  actual_value: number | null;
  unit_ar: string;
  weight: number | null;
  status: string;
}

function achievementPercent(row: { target_value: number | null; actual_value: number | null }): number | null {
  if (row.actual_value == null || !row.target_value) return null;
  return Math.round((row.actual_value / row.target_value) * 100);
}

// Ungated (2026-07-27, same "reports" precedent) — real access is entirely
// row-level via the strategic-goal cascade's own RLS (org_structure
// position ownership / being the assigned employee), not a flat role
// grant most roles never hold.
export default async function KpisPage() {
  const t = await getTranslations("KpisPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const myProfileId = myProfile?.id ?? null;

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canManageStrategicGoals = hasVpraAccess(permissions.strategicPlanning ?? "none", "approve");

  // Self-row (org_structure_assignments' own RLS lets an employee see their
  // own assignment rows regardless of VPRA).
  const { data: myAssignments } = myProfileId
    ? await supabase.from("org_structure_assignments").select("position_id").eq("employee_id", myProfileId).is("deleted_at", null)
    : { data: null };
  const myPositionIds = new Set((myAssignments ?? []).map((a) => a.position_id));

  // RLS already scopes both queries to exactly what the caller is allowed
  // to see (owned nodes + their full descendant subtree, or their own
  // assigned-employee leaf) — no additional filtering needed to avoid
  // over-fetching, unlike the org-wide oversight roles (strategy_admin/ceo)
  // who deliberately see everything via check_vpra_global.
  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, target_value, actual_value, unit_ar, weight")
    .is("deleted_at", null);
  const subGoals = (subGoalsData ?? []) as SubGoalRow[];

  const { data: targetsData } = await supabase
    .from("targets")
    .select("id, sub_goal_id, assigned_position_id, assigned_employee_id, title_ar, target_value, actual_value, unit_ar, weight, status")
    .is("deleted_at", null);
  const targets = (targetsData ?? []) as TargetRow[];

  const strategicGoalIds = Array.from(new Set(subGoals.map((sg) => sg.strategic_goal_id)));
  const { data: strategicGoalsData } =
    strategicGoalIds.length > 0
      ? await supabase.from("strategic_goals").select("id, title_ar").in("id", strategicGoalIds)
      : { data: [] };
  const strategicGoalTitleById = new Map(((strategicGoalsData ?? []) as Array<{ id: string; title_ar: string }>).map((g) => [g.id, g.title_ar]));

  const ownedSubGoals = subGoals.filter((sg) => myPositionIds.has(sg.owner_position_id));
  const ownedTargets = targets.filter((t) => t.assigned_position_id != null && myPositionIds.has(t.assigned_position_id));
  const assignedToMeTargets = targets.filter((t) => t.assigned_employee_id === myProfileId);
  // Employee-assigned targets that are neither owned-by-position nor
  // assigned to me directly — a real gap found live: targets_update's RLS
  // (20260727000005) lets whoever owns the IMMEDIATE PARENT report
  // progress on an employee-leaf target on their behalf (there's no
  // assigned_position_id on that row itself to match), but without this
  // section that capability had no UI to invoke it at all. Broader than
  // "immediate parent only" (RLS is the real, narrower gate; this list is
  // scoped by is_in_my_strategic_subtree via the same visible `targets`
  // fetch above, same "seeing an option doesn't guarantee it succeeds"
  // convention as every other assign screen in this app).
  const teamTargets = targets.filter(
    (t) => t.assigned_employee_id != null && t.assigned_employee_id !== myProfileId
  );
  const teamEmployeeIds = Array.from(new Set(teamTargets.map((t) => t.assigned_employee_id!)));
  const { data: teamEmployeesData } =
    teamEmployeeIds.length > 0
      ? await supabase.from("profiles").select("id, employee_number, full_name_ar").in("id", teamEmployeeIds)
      : { data: [] };
  const teamEmployeeById = new Map(
    ((teamEmployeesData ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((p) => [p.id, p])
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canManageStrategicGoals && (
          <Link href="/kpis/strategic-goals" className="sru-btn sru-btn-primary">
            {t("manageLink")}
          </Link>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("ownedHeading")}
      </h2>
      {ownedSubGoals.length === 0 && ownedTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("ownedEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnType")}</th>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnStrategicGoal")}</th>
                  <th>{t("columnTarget")}</th>
                  <th>{t("columnActual")}</th>
                  <th>{t("columnAchievement")}</th>
                  <th>{t("columnWeight")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ownedSubGoals.map((sg) => (
                  <tr key={`sub-${sg.id}`}>
                    <td>{t("typeSubGoal")}</td>
                    <td>{sg.title_ar}</td>
                    <td>{strategicGoalTitleById.get(sg.strategic_goal_id) ?? "—"}</td>
                    <td>
                      {sg.target_value ?? "—"} {sg.unit_ar}
                    </td>
                    <td>
                      <UpdateProgressForm nodeType="sub_goal" id={sg.id} currentActualValue={sg.actual_value} unitAr={sg.unit_ar} />
                    </td>
                    <td>{achievementPercent(sg) != null ? `${achievementPercent(sg)}%` : "—"}</td>
                    <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                    <td>
                      <Link href={`/kpis/assign?subGoalId=${sg.id}`} className="sru-btn" style={{ fontSize: 12, padding: "4px 10px" }}>
                        {t("cascadeButton")}
                      </Link>
                    </td>
                  </tr>
                ))}
                {ownedTargets.map((tg) => (
                  <tr key={`target-${tg.id}`}>
                    <td>{t("typeTarget")}</td>
                    <td>{tg.title_ar}</td>
                    <td>{strategicGoalTitleById.get(subGoals.find((sg) => sg.id === tg.sub_goal_id)?.strategic_goal_id ?? "") ?? "—"}</td>
                    <td>
                      {tg.target_value} {tg.unit_ar}
                    </td>
                    <td>
                      <UpdateProgressForm nodeType="target" id={tg.id} currentActualValue={tg.actual_value} unitAr={tg.unit_ar} />
                    </td>
                    <td>{achievementPercent(tg) != null ? `${achievementPercent(tg)}%` : "—"}</td>
                    <td>{tg.weight != null ? `${tg.weight}%` : "—"}</td>
                    <td>
                      <Link
                        href={`/kpis/assign?parentTargetId=${tg.id}`}
                        className="sru-btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        {t("cascadeButton")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("assignedHeading")}
      </h2>
      {assignedToMeTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("assignedEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnStrategicGoal")}</th>
                  <th>{t("columnTarget")}</th>
                  <th>{t("columnActual")}</th>
                  <th>{t("columnAchievement")}</th>
                  <th>{t("columnWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {assignedToMeTargets.map((tg) => (
                  <tr key={tg.id}>
                    <td>{tg.title_ar}</td>
                    <td>{strategicGoalTitleById.get(subGoals.find((sg) => sg.id === tg.sub_goal_id)?.strategic_goal_id ?? "") ?? "—"}</td>
                    <td>
                      {tg.target_value} {tg.unit_ar}
                    </td>
                    <td>{tg.actual_value != null ? `${tg.actual_value} ${tg.unit_ar}` : t("notReportedYet")}</td>
                    <td>{achievementPercent(tg) != null ? `${achievementPercent(tg)}%` : "—"}</td>
                    <td>{tg.weight != null ? `${tg.weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sru-title" style={{ fontSize: 18, margin: "32px 0 12px" }}>
        {t("teamHeading")}
      </h2>
      {teamTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("teamEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnTarget")}</th>
                  <th>{t("columnActual")}</th>
                  <th>{t("columnAchievement")}</th>
                  <th>{t("columnWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {teamTargets.map((tg) => {
                  const employee = teamEmployeeById.get(tg.assigned_employee_id!);
                  return (
                    <tr key={tg.id}>
                      <td>{employee ? `${employee.employee_number} — ${employee.full_name_ar}` : "—"}</td>
                      <td>{tg.title_ar}</td>
                      <td>
                        {tg.target_value} {tg.unit_ar}
                      </td>
                      <td>
                        <UpdateProgressForm nodeType="target" id={tg.id} currentActualValue={tg.actual_value} unitAr={tg.unit_ar} />
                      </td>
                      <td>{achievementPercent(tg) != null ? `${achievementPercent(tg)}%` : "—"}</td>
                      <td>{tg.weight != null ? `${tg.weight}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
