import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { UpdateProgressForm } from "@/components/UpdateProgressForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

interface SubGoalRow {
  id: string;
  strategic_goal_id: string;
  owner_position_id: string;
  title_ar: string;
  weight: number | null;
}

// 2026-07-30: a sub-goal no longer carries its own inline KPI -- its
// indicators are `strategic_kpis` rows (many per sub-goal), each with a
// plan-long target; the annual figures live in kpi_annual_targets.
interface KpiRow {
  id: string;
  sub_goal_id: string | null;
  title_ar: string;
  unit_ar: string;
  plan_target_value: number | null;
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
    .select("id, strategic_goal_id, owner_position_id, title_ar, weight")
    .is("deleted_at", null);
  const subGoals = (subGoalsData ?? []) as SubGoalRow[];

  const { data: targetsData } = await supabase
    .from("targets")
    .select("id, sub_goal_id, assigned_position_id, assigned_employee_id, title_ar, target_value, actual_value, unit_ar, weight, status")
    .is("deleted_at", null);
  const targets = (targetsData ?? []) as TargetRow[];

  const { data: kpisData } = await supabase
    .from("strategic_kpis")
    .select("id, sub_goal_id, title_ar, unit_ar, plan_target_value")
    .is("deleted_at", null);
  const kpisBySubGoal = new Map<string, KpiRow[]>();
  for (const k of (kpisData ?? []) as KpiRow[]) {
    if (!k.sub_goal_id) continue;
    const list = kpisBySubGoal.get(k.sub_goal_id) ?? [];
    list.push(k);
    kpisBySubGoal.set(k.sub_goal_id, list);
  }

  const strategicGoalIds = Array.from(new Set(subGoals.map((sg) => sg.strategic_goal_id)));
  const { data: strategicGoalsData } =
    strategicGoalIds.length > 0
      ? await supabase.from("strategic_goals").select("id, title_ar").in("id", strategicGoalIds)
      : { data: [] };
  const strategicGoalTitleById = new Map(((strategicGoalsData ?? []) as Array<{ id: string; title_ar: string }>).map((g) => [g.id, g.title_ar]));

  const ownedSubGoals = subGoals.filter((sg) => myPositionIds.has(sg.owner_position_id));
  const ownedTargets = targets.filter((t) => t.assigned_position_id != null && myPositionIds.has(t.assigned_position_id));
  const assignedToMeTargets = targets.filter((t) => t.assigned_employee_id === myProfileId);
  // The two halves the project owner asked for (2026-07-30, "نعم ما وصلني
  // مقابل ما اسندته فعلا لمن دوني"): a non-overlapping partition, so no row
  // appears twice.
  //
  //   RECEIVED  = cascaded onto me: sub-goals my position owns, targets
  //               assigned to my position, and targets assigned to me
  //               personally. (ownedSubGoals/ownedTargets/assignedToMeTargets
  //               above.)
  //   CASCADED  = what I actually pushed further down: every visible target
  //               assigned to someone OTHER than me -- another position
  //               (below mine, since `targets` is already RLS-scoped to my
  //               own subtree) or another employee.
  //
  // The employee half was previously the only one shown ("مستهدفات فريقك");
  // position-assigned children below me had no section at all, so a C2 owner
  // who cascaded to C3 positions could not see that from this page.
  const cascadedDownTargets = targets.filter(
    (t) =>
      (t.assigned_employee_id != null && t.assigned_employee_id !== myProfileId) ||
      (t.assigned_position_id != null && !myPositionIds.has(t.assigned_position_id))
  );
  const teamTargets = cascadedDownTargets;
  // Only the employee-assigned half has a profile to look up -- the
  // position-assigned rows in this list have assigned_employee_id = NULL
  // (targets_assignee_xor), so they must be filtered out before the .in()
  // lookup rather than passed through as nulls.
  const teamEmployeeIds = Array.from(
    new Set(teamTargets.map((t) => t.assigned_employee_id).filter((id): id is string => id != null))
  );
  const { data: teamEmployeesData } =
    teamEmployeeIds.length > 0
      ? await supabase.from("profiles").select("id, employee_number, full_name_ar").in("id", teamEmployeeIds)
      : { data: [] };
  const teamEmployeeById = new Map(
    ((teamEmployeesData ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((p) => [p.id, p])
  );

  // list_org_structure_positions(): SECURITY DEFINER RPC -- a cascaded
  // target can land on a POSITION rather than an employee, and this page now
  // shows those too, so it needs position names. Same reason the strategic
  // goals screen uses the RPC: org_structure_positions_select requires
  // orgStructure=view, which the position-holders this page serves don't hold.
  const { data: positionsData } = await supabase.rpc("list_org_structure_positions");
  const positionNameById = new Map(
    ((positionsData ?? []) as Array<{ id: string; name_ar: string }>).map((p) => [p.id, p.name_ar])
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="strategicPlan" current="kpis" />
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

      {/* "مؤشرات الأداء" section (2026-07-29 restructure): sub-goals only --
          each one is directly linked to its strategic goal (columnStrategicGoal),
          which is the literal "مرتبطة بالأهداف" request. Previously mixed
          together with owned targets under one "ownedHeading" table; split
          out here so KPIs and targets read as two distinct, clearly labeled
          sections on this one page, in that order. */}
      <h2 className="sru-title" style={{ fontSize: 20, margin: "8px 0 16px" }}>
        {t("receivedHeading")}
      </h2>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{t("receivedSubtitle")}</p>

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("kpiSectionHeading")}</h3>
      {ownedSubGoals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("kpiSectionEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnStrategicGoal")}</th>
                  <th>{t("columnKpi")}</th>
                  <th>{t("columnWeight")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ownedSubGoals.map((sg) => (
                  <tr key={sg.id}>
                    <td>{sg.title_ar}</td>
                    <td>{strategicGoalTitleById.get(sg.strategic_goal_id) ?? "—"}</td>
                    <td>
                      {(kpisBySubGoal.get(sg.id) ?? []).length === 0
                        ? "—"
                        : (kpisBySubGoal.get(sg.id) ?? [])
                            .map((k) => `${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})`)
                            .join("، ")}
                    </td>
                    <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                    <td>
                      <Link href={`/kpis/assign?subGoalId=${sg.id}`} className="sru-btn" style={{ fontSize: 12, padding: "4px 10px" }}>
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

      {/* "المستهدفات" section: everything target-related, after the KPI
          section above per the explicit "وكذلك بعدها بنفس الصفحة
          المستهدفات" request. The three existing sub-groupings (owned /
          assigned-to-me / team) keep their distinct meaning, now nested
          under this one umbrella heading instead of owned-targets being
          mixed into the KPI table above. */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("ownedHeading")}</h3>
      {ownedTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("ownedEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {ownedTargets.map((tg) => (
                  <tr key={tg.id}>
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

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("assignedHeading")}</h3>
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

      <h2 className="sru-title" style={{ fontSize: 20, margin: "36px 0 8px" }}>
        {t("cascadedHeading")}
      </h2>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{t("cascadedSubtitle")}</p>
      {teamTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("cascadedEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnAssignee")}</th>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnTarget")}</th>
                  <th>{t("columnActual")}</th>
                  <th>{t("columnAchievement")}</th>
                  <th>{t("columnWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {teamTargets.map((tg) => {
                  // A cascaded target lands on EITHER a position or an
                  // employee (targets_assignee_xor), so this one column
                  // resolves whichever of the two it actually is.
                  const employee = tg.assigned_employee_id ? teamEmployeeById.get(tg.assigned_employee_id) : undefined;
                  const assignee = employee
                    ? `${employee.employee_number} — ${employee.full_name_ar}`
                    : tg.assigned_position_id
                      ? (positionNameById.get(tg.assigned_position_id) ?? "—")
                      : "—";
                  return (
                    <tr key={tg.id}>
                      <td>{assignee}</td>
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
