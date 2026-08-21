import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Flag, Star } from "lucide-react";
import { StrategicIdentityForm } from "@/components/StrategicIdentityForm";
import { StrategicValueRow } from "@/components/StrategicValueRow";
import { AddStrategicValueForm } from "@/components/AddStrategicValueForm";
import { UpdateProgressForm } from "@/components/UpdateProgressForm";
import { PrintButton } from "@/components/PrintButton";
import { StrategicPlanExcelButtons } from "@/components/StrategicPlanExcelButtons";
import {
  InitiativesPanel,
  type InitiativeStatusOption,
  type InitiativeTargetOption,
  type InitiativeView,
} from "@/components/InitiativesPanel";
import { ProgramsPanel, type ProgramSummary } from "@/components/ProgramsPanel";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
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

interface KpiRow {
  id: string;
  strategic_goal_id: string | null;
  sub_goal_id: string | null;
  title_ar: string;
  unit_ar: string;
  plan_target_value: number | null;
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

function describeKpis(list: KpiRow[]): string {
  if (list.length === 0) return "—";
  return list.map((k) => `${k.title_ar} (${k.plan_target_value ?? "—"} ${k.unit_ar})`).join("، ");
}

// The per-plan "working page" requested 2026-08-01 ("اذا ضغطت على اي وحدة
// [خطة] تطلع لي هذه الصفحة واللي فيها اركان الخطة الاستراتيجية وما اسند لي
// منها ودوري في انجاح الخطة"): one page per `strategic_plans` row, with the
// plan's own name shown at the top ("بحيث أعلم أنا شغال على أي خطة") and
// the same four sections already built as separate pages -- بنك الأهداف /
// الأهداف المسندة / الأهداف الاستراتيجية / الرؤية والرسالة والقيم -- now
// reproduced as tabs (via the existing ProfileTabs client component, since
// GroupTabs can't render tabs for a dynamic route segment).
//
// Ungated, same "vision/mission opened to everyone" precedent (20260730000004)
// -- viewing a plan is for all staff; each underlying table's OWN RLS is
// still the real filter (a plain employee outside a goal's cascade chain
// simply sees an empty الأهداف الاستراتيجية tab, same as on /kpis today).
//
// Vision/mission/values and the goal_library catalog are GLOBAL reference
// data with no plan_id column at all (confirmed directly against both
// tables' schema) -- shown here unfiltered, exactly as on their own
// standalone pages, not duplicated per plan. Strategic goals/sub-goals/
// KPIs/targets ARE plan-scoped (strategic_goals.plan_id, NOT NULL since
// 20260730000001) -- filtered to this plan's own goal/sub-goal ids in JS
// after the same RLS-scoped fetches the existing pages already use (small
// reference tables, same "fetch then filter" precedent already used for
// e.g. the cascaded-targets split on /kpis).
export default async function StrategicPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("StrategicPlanDetailPage");
  const tIdentity = await getTranslations("StrategicIdentityPage");
  const tGoals = await getTranslations("StrategicGoalsPage");
  const tKpis = await getTranslations("KpisPage");
  const tLibrary = await getTranslations("GoalLibraryPage");
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("strategic_plans")
    .select("id, name_ar, name_en, start_year, end_year")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!plan) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <Link
          href="/kpis/plans"
          className="sru-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
        >
          <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
          {t("backToList")}
        </Link>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

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
  const strategicPlanningLevel = permissions.strategicPlanning ?? "none";
  const canEditIdentity = hasVpraAccess(strategicPlanningLevel, "prepare");
  const canManageGoals = hasVpraAccess(strategicPlanningLevel, "approve");

  // ---- Vision / Mission / Values: global reference, not plan-scoped ----
  const { data: identity } = await supabase
    .from("strategic_identity")
    .select("vision_ar, vision_en, mission_ar, mission_en")
    .maybeSingle();
  const { data: valuesData } = await supabase
    .from("strategic_values")
    .select("id, title_ar, title_en, description_ar")
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const values = (valuesData ?? []) as Array<{ id: string; title_ar: string; title_en: string | null; description_ar: string | null }>;

  // ---- This plan's strategic goals / sub-goals / KPIs ----
  const { data: goalsData } = await supabase
    .from("strategic_goals")
    .select("id, title_ar, weight")
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const goals = (goalsData ?? []) as StrategicGoalRow[];
  const goalIds = new Set(goals.map((g) => g.id));
  const strategicGoalTitleById = new Map(goals.map((g) => [g.id, g.title_ar]));

  const { data: subGoalsData } = await supabase
    .from("sub_goals")
    .select("id, strategic_goal_id, owner_position_id, title_ar, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subGoals = ((subGoalsData ?? []) as SubGoalRow[]).filter((sg) => goalIds.has(sg.strategic_goal_id));
  const subGoalIds = new Set(subGoals.map((sg) => sg.id));

  const { data: kpisData } = await supabase
    .from("strategic_kpis")
    .select("id, strategic_goal_id, sub_goal_id, title_ar, unit_ar, plan_target_value, weight")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const kpis = ((kpisData ?? []) as KpiRow[]).filter(
    (k) => (k.strategic_goal_id != null && goalIds.has(k.strategic_goal_id)) || (k.sub_goal_id != null && subGoalIds.has(k.sub_goal_id))
  );
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

  // list_org_structure_positions(): SECURITY DEFINER RPC, same reason the
  // strategic-goals/goal-library pages use it (org_structure_positions_select's
  // own RLS doesn't cover every role that can reach this page).
  const { data: positions } = await supabase.rpc("list_org_structure_positions");
  const positionNameById = new Map(((positions ?? []) as Array<{ id: string; name_ar: string }>).map((p) => [p.id, p.name_ar]));

  const subGoalsByStrategicGoal = new Map<string, SubGoalRow[]>();
  for (const sg of subGoals) {
    const list = subGoalsByStrategicGoal.get(sg.strategic_goal_id) ?? [];
    list.push(sg);
    subGoalsByStrategicGoal.set(sg.strategic_goal_id, list);
  }

  // ---- Assigned-to-me content, scoped to this plan's sub-goals/targets ----
  const { data: myAssignments } = myProfileId
    ? await supabase.from("org_structure_assignments").select("position_id").eq("employee_id", myProfileId).is("deleted_at", null)
    : { data: null };
  const myPositionIds = new Set((myAssignments ?? []).map((a) => a.position_id));

  const { data: targetsData } = await supabase
    .from("targets")
    .select("id, sub_goal_id, assigned_position_id, assigned_employee_id, title_ar, target_value, actual_value, unit_ar, weight, status")
    .is("deleted_at", null);
  const targets = ((targetsData ?? []) as TargetRow[]).filter((tg) => subGoalIds.has(tg.sub_goal_id));

  const ownedSubGoals = subGoals.filter((sg) => myPositionIds.has(sg.owner_position_id));
  const ownedTargets = targets.filter((tg) => tg.assigned_position_id != null && myPositionIds.has(tg.assigned_position_id));
  const assignedToMeTargets = targets.filter((tg) => tg.assigned_employee_id === myProfileId);
  const cascadedDownTargets = targets.filter(
    (tg) =>
      (tg.assigned_employee_id != null && tg.assigned_employee_id !== myProfileId) ||
      (tg.assigned_position_id != null && !myPositionIds.has(tg.assigned_position_id))
  );
  const teamEmployeeIds = Array.from(
    new Set(cascadedDownTargets.map((tg) => tg.assigned_employee_id).filter((v): v is string => v != null))
  );
  const { data: teamEmployeesData } =
    teamEmployeeIds.length > 0
      ? await supabase.from("profiles").select("id, employee_number, full_name_ar").in("id", teamEmployeeIds)
      : { data: [] };
  const teamEmployeeById = new Map(
    ((teamEmployeesData ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map((p) => [p.id, p])
  );

  // ---- Goal library catalog: global, not plan-scoped ----
  const { data: libraryData } = await supabase
    .from("goal_library")
    .select("id, title_ar, title_en, description_ar, default_weight, job_families(name_ar)")
    .is("deleted_at", null)
    .order("title_ar");
  const libraryGoals = libraryData as unknown as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    default_weight: number | null;
    job_families: { name_ar: string } | null;
  }> | null;

  const identityContent = (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{tIdentity("subtitle")}</p>
      <StrategicIdentityForm canEdit={canEditIdentity} identity={identity ?? null} />
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Star size={17} aria-hidden />
          </span>
          <div>
            <h3>{tIdentity("valuesHeading")}</h3>
          </div>
        </div>
        {values.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tIdentity("valuesEmpty")}</p>
        ) : (
          values.map((v) => (
            <StrategicValueRow
              key={v.id}
              canEdit={canEditIdentity}
              valueId={v.id}
              initialTitleAr={v.title_ar}
              initialTitleEn={v.title_en}
              initialDescriptionAr={v.description_ar}
            />
          ))
        )}
        {canEditIdentity && <AddStrategicValueForm />}
      </section>
    </div>
  );

  const goalsContent = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tGoals("subtitle")}</p>
        <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
          {canManageGoals && (
            <Link href="/kpis/strategic-goals/new" className="sru-btn sru-btn-primary" style={{ whiteSpace: "nowrap" }}>
              {tGoals("addGoalButton")}
            </Link>
          )}
          <StrategicPlanExcelButtons planId={plan.id} canImport={canManageGoals} />
        </div>
      </div>
      {goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{tGoals("empty")}</p>
      ) : (
        goals.map((goal) => {
          const goalSubGoals = subGoalsByStrategicGoal.get(goal.id) ?? [];
          return (
            <div key={goal.id} className="sru-card" style={{ marginBottom: 24, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{goal.title_ar}</strong>
                  {goal.weight != null && (
                    <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
                      {tGoals("columnWeight")}: {goal.weight}%
                    </p>
                  )}
                </div>
                {canManageGoals && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Link href={`/kpis/manage-kpis?goalId=${goal.id}`} className="sru-btn" style={{ fontSize: 13 }}>
                      {tGoals("manageKpisButton")}
                    </Link>
                    <Link href={`/kpis/strategic-goals/${goal.id}/sub-goals/new`} className="sru-btn" style={{ fontSize: 13 }}>
                      {tGoals("addSubGoalButton")}
                    </Link>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{tGoals("kpisHeading")}</h4>
              {(kpisByGoal.get(goal.id) ?? []).length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tGoals("kpisEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{tGoals("columnKpi")}</th>
                        <th>{tGoals("columnUnit")}</th>
                        <th>{tGoals("columnPlanTarget")}</th>
                        <th>{tGoals("columnWeight")}</th>
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

              <h4 style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>{tGoals("subGoalsHeading")}</h4>
              {goalSubGoals.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tGoals("subGoalsEmpty")}</p>
              ) : (
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{tGoals("columnTitle")}</th>
                        <th>{tGoals("columnOwner")}</th>
                        <th>{tGoals("columnKpi")}</th>
                        <th>{tGoals("columnWeight")}</th>
                        {canManageGoals && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {goalSubGoals.map((sg) => (
                        <tr key={sg.id}>
                          <td>{sg.title_ar}</td>
                          <td>{positionNameById.get(sg.owner_position_id) ?? "—"}</td>
                          <td>{describeKpis(kpisBySubGoal.get(sg.id) ?? [])}</td>
                          <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                          {canManageGoals && (
                            <td>
                              <Link
                                href={`/kpis/manage-kpis?subGoalId=${sg.id}`}
                                className="sru-btn"
                                style={{ fontSize: 12, padding: "4px 10px" }}
                              >
                                {tGoals("manageKpisButton")}
                              </Link>
                            </td>
                          )}
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

  const assignedContent = (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{tKpis("receivedSubtitle")}</p>

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{tKpis("kpiSectionHeading")}</h3>
      {ownedSubGoals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{tKpis("kpiSectionEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{tKpis("columnTitle")}</th>
                  <th>{tKpis("columnStrategicGoal")}</th>
                  <th>{tKpis("columnKpi")}</th>
                  <th>{tKpis("columnWeight")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ownedSubGoals.map((sg) => (
                  <tr key={sg.id}>
                    <td>{sg.title_ar}</td>
                    <td>{strategicGoalTitleById.get(sg.strategic_goal_id) ?? "—"}</td>
                    <td>{describeKpis(kpisBySubGoal.get(sg.id) ?? [])}</td>
                    <td>{sg.weight != null ? `${sg.weight}%` : "—"}</td>
                    <td>
                      <Link href={`/kpis/assign?subGoalId=${sg.id}`} className="sru-btn" style={{ fontSize: 12, padding: "4px 10px" }}>
                        {tKpis("cascadeButton")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{tKpis("ownedHeading")}</h3>
      {ownedTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{tKpis("ownedEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{tKpis("columnTitle")}</th>
                  <th>{tKpis("columnStrategicGoal")}</th>
                  <th>{tKpis("columnTarget")}</th>
                  <th>{tKpis("columnActual")}</th>
                  <th>{tKpis("columnAchievement")}</th>
                  <th>{tKpis("columnWeight")}</th>
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
                        {tKpis("cascadeButton")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{tKpis("assignedHeading")}</h3>
      {assignedToMeTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{tKpis("assignedEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{tKpis("columnTitle")}</th>
                  <th>{tKpis("columnStrategicGoal")}</th>
                  <th>{tKpis("columnTarget")}</th>
                  <th>{tKpis("columnActual")}</th>
                  <th>{tKpis("columnAchievement")}</th>
                  <th>{tKpis("columnWeight")}</th>
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
                    <td>{tg.actual_value != null ? `${tg.actual_value} ${tg.unit_ar}` : tKpis("notReportedYet")}</td>
                    <td>{achievementPercent(tg) != null ? `${achievementPercent(tg)}%` : "—"}</td>
                    <td>{tg.weight != null ? `${tg.weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="sru-title" style={{ fontSize: 18, margin: "36px 0 8px" }}>
        {tKpis("cascadedHeading")}
      </h2>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 16 }}>{tKpis("cascadedSubtitle")}</p>
      {cascadedDownTargets.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{tKpis("cascadedEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{tKpis("columnAssignee")}</th>
                  <th>{tKpis("columnTitle")}</th>
                  <th>{tKpis("columnTarget")}</th>
                  <th>{tKpis("columnActual")}</th>
                  <th>{tKpis("columnAchievement")}</th>
                  <th>{tKpis("columnWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {cascadedDownTargets.map((tg) => {
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

  const libraryContent = (
    <div>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tLibrary("subtitle")}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/goals/assign" className="sru-btn sru-btn-primary">
            {tLibrary("assignGoal")}
          </Link>
          <PrintButton />
        </div>
      </div>
      {!libraryGoals || libraryGoals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{tLibrary("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{tLibrary("columnTitle")}</th>
                  <th>{tLibrary("columnJobFamily")}</th>
                  <th>{tLibrary("columnDefaultWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {libraryGoals.map((goal) => (
                  <tr key={goal.id}>
                    <td>
                      {goal.title_ar}
                      {goal.description_ar && (
                        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{goal.description_ar}</p>
                      )}
                    </td>
                    <td>{goal.job_families?.name_ar ?? tLibrary("allJobFamilies")}</td>
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

  // ---- المبادرات: what will actually achieve this plan's targets ----
  // Requested 2026-08-19, placed directly after الأهداف الاستراتيجية ("وبعد
  // اضافة المستهدفات اضف المبادرات"). A link points at either a KPI (its
  // plan-level target) or one annual target — the XOR the link table
  // enforces — so both meanings of "المستهدف" on this screen are covered.
  const { data: initiativesData } = await supabase
    .from("strategic_initiatives")
    .select(
      "id, title_ar, title_en, description_ar, owner_org_unit_id, sub_goal_id, start_date, end_date, status_code, progress_percent"
    )
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const initiativeRows = (initiativesData ?? []) as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    owner_org_unit_id: string | null;
    sub_goal_id: string | null;
    start_date: string | null;
    end_date: string | null;
    status_code: string;
    progress_percent: number | string | null;
  }>;

  const { data: initiativeLinksData } = await supabase
    .from("strategic_initiative_targets")
    .select("id, initiative_id, kpi_id, kpi_annual_target_id")
    .is("deleted_at", null);
  const initiativeLinkRows = ((initiativeLinksData ?? []) as Array<{
    id: string;
    initiative_id: string;
    kpi_id: string | null;
    kpi_annual_target_id: string | null;
  }>).filter((l) => initiativeRows.some((i) => i.id === l.initiative_id));

  const { data: annualTargetsData } = await supabase
    .from("kpi_annual_targets")
    .select("id, kpi_id, cycle_id, target_value")
    .is("deleted_at", null);
  const annualTargetRows = ((annualTargetsData ?? []) as Array<{
    id: string;
    kpi_id: string;
    cycle_id: string;
    target_value: number;
  }>).filter((a) => kpis.some((k) => k.id === a.kpi_id));

  const { data: cyclesData } =
    annualTargetRows.length > 0
      ? await supabase.from("evaluation_cycles").select("id, name_ar").is("deleted_at", null)
      : { data: [] };
  const cycleNameById = new Map(((cyclesData ?? []) as Array<{ id: string; name_ar: string }>).map((c) => [c.id, c.name_ar]));
  const kpiById = new Map(kpis.map((k) => [k.id, k]));

  const targetOptions: InitiativeTargetOption[] = [
    ...kpis.map((k) => ({
      value: `kpi:${k.id}`,
      label: `${k.title_ar} — ${t("planTargetLabel")}: ${k.plan_target_value ?? "—"} ${k.unit_ar}`,
    })),
    ...annualTargetRows.map((a) => {
      const k = kpiById.get(a.kpi_id);
      return {
        value: `annual:${a.id}`,
        label: `${k?.title_ar ?? "—"} — ${cycleNameById.get(a.cycle_id) ?? "—"}: ${a.target_value} ${k?.unit_ar ?? ""}`,
      };
    }),
  ];
  const targetLabelByValue = new Map(targetOptions.map((o) => [o.value, o.label]));

  const { data: initiativeOrgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("name_ar");
  const orgUnitOptions = ((initiativeOrgUnits ?? []) as Array<{ id: string; name_ar: string }>).map((u) => ({
    id: u.id,
    name: u.name_ar,
  }));
  const orgUnitNameById = new Map(orgUnitOptions.map((u) => [u.id, u.name]));

  // The initiative's own sub-goal ("الهدف الفرعي (LOGIC)" on the real cards),
  // limited to this plan's sub-goals.
  const subGoalOptions = subGoals.map((sg) => ({ id: sg.id, title: sg.title_ar }));
  const subGoalTitleById = new Map(subGoalOptions.map((sg) => [sg.id, sg.title]));
  // The main goal is DERIVED from the sub-goal (the cards present it that way
  // too), so it is never a second stored field to keep in step.
  const mainGoalIdBySubGoal = new Map(subGoals.map((sg) => [sg.id, sg.strategic_goal_id]));
  const goalTitleById = new Map(goals.map((g) => [g.id, g.title_ar]));


  const { data: statusRows } = await supabase
    .from("initiative_statuses")
    .select("code, label_ar")
    .eq("is_active", true)
    .order("display_order");
  const statusOptions: InitiativeStatusOption[] = ((statusRows ?? []) as Array<{ code: string; label_ar: string }>).map((r) => ({
    code: r.code,
    label: r.label_ar,
  }));
  const statusLabelByCode = new Map(statusOptions.map((s) => [s.code, s.label]));

  // Built AFTER the org-unit and sub-goal lookups above: reading them from
  // here while they were still declared below crashed the whole page with a
  // temporal-dead-zone ReferenceError as soon as the plan had one initiative
  // (an empty list never evaluated the map body, which is why it stayed
  // hidden until the first one was added).
  const initiatives: InitiativeView[] = initiativeRows.map((row) => ({
    id: row.id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    descriptionAr: row.description_ar,
    ownerOrgUnitName: row.owner_org_unit_id ? orgUnitNameById.get(row.owner_org_unit_id) ?? null : null,
    ownerOrgUnitId: row.owner_org_unit_id,
    subGoalTitle: row.sub_goal_id ? subGoalTitleById.get(row.sub_goal_id) ?? null : null,
    mainGoalId: row.sub_goal_id ? mainGoalIdBySubGoal.get(row.sub_goal_id) ?? null : null,
    mainGoalTitle: row.sub_goal_id ? goalTitleById.get(mainGoalIdBySubGoal.get(row.sub_goal_id) ?? "") ?? null : null,
    startDate: row.start_date,
    endDate: row.end_date,
    statusLabel: statusLabelByCode.get(row.status_code) ?? row.status_code,
    statusCode: row.status_code,
    progressPercent: row.progress_percent,
    links: initiativeLinkRows
      .filter((l) => l.initiative_id === row.id)
      .map((l) => ({
        id: l.id,
        label:
          targetLabelByValue.get(l.kpi_id ? `kpi:${l.kpi_id}` : `annual:${l.kpi_annual_target_id}`) ??
          t("unknownTarget"),
      })),
  }));

  const initiativesContent = (
    <div>
      <InitiativesPanel
        toolbar={<StrategicPlanExcelButtons planId={plan.id} canImport={canManageGoals} />}
        planId={plan.id}
        initiatives={initiatives}
        targetOptions={targetOptions}
        orgUnitOptions={orgUnitOptions}
        subGoalOptions={subGoalOptions}
        statusOptions={statusOptions}
        canManage={canManageGoals}
      />
    </div>
  );

  // ---- برامج الاستراتيجية: programs grouping this plan's initiatives ----
  // A committee member with no strategicPlanning grant still sees their own
  // programs here — strategic_programs_select lets membership alone grant
  // read (20260819000002), which is the "لكل عضو في اللجنة أكسس" ask.
  const { data: programRows } = await supabase
    .from("strategic_programs")
    .select("id, name_ar, name_en, status, start_date, end_date")
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const programList = (programRows ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: programInitiativeCounts } = await supabase
    .from("strategic_program_initiatives")
    .select("program_id")
    .is("deleted_at", null);
  const { data: programCommitteeCounts } = await supabase
    .from("strategic_program_committee_members")
    .select("program_id")
    .is("deleted_at", null);
  function countFor(rows: Array<{ program_id: string }> | null, programId: string): number {
    return (rows ?? []).filter((r) => r.program_id === programId).length;
  }

  const programs: ProgramSummary[] = programList.map((p) => ({
    id: p.id,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    status: p.status,
    startDate: p.start_date,
    endDate: p.end_date,
    initiativeCount: countFor(programInitiativeCounts as Array<{ program_id: string }> | null, p.id),
    committeeCount: countFor(programCommitteeCounts as Array<{ program_id: string }> | null, p.id),
  }));

  const programsContent = <ProgramsPanel planId={plan.id} programs={programs} canManage={canManageGoals} />;

  // Order requested directly (2026-08-01): vision/mission first (the
  // foundation), then strategic goals (main + sub-goals + KPIs), then --
  // added 2026-08-19 -- the initiatives that achieve those targets, then
  // assigned goals (deferred follow-up work per the same request), then the
  // goal library last.
  const tabs: ProfileTab[] = [
    { id: "identity", label: tIdentity("title"), content: identityContent },
    { id: "goals", label: tGoals("title"), content: goalsContent },
    { id: "initiatives", label: t("initiativesTab"), content: initiativesContent },
    { id: "programs", label: t("programsTab"), content: programsContent },
    { id: "assigned", label: tKpis("title"), content: assignedContent },
    { id: "library", label: tLibrary("title"), content: libraryContent },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/kpis/plans"
        className="sru-btn no-print"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backToList")}
      </Link>
      {/* The export/import tools used to float up here beside the plan's
          title in their own style. They now live in each tab's action row
          next to that tab's primary action, all one shape (2026-08-20
          request). Import still shows only at 'approve' — the level the
          goals/sub-goals/KPIs/annual-targets policies actually require;
          the identity/values sheets sit lower at 'prepare', so a
          prepare-level caller keeps editing those through the tab itself. */}
      <div
        style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Flag size={20} aria-hidden style={{ color: "var(--sru-purple)" }} />
            <h1 className="sru-title" style={{ fontSize: 24 }}>
              {plan.name_ar}
            </h1>
          </div>
          {plan.name_en && (
            <p dir="ltr" style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 2 }}>
              {plan.name_en}
            </p>
          )}
          <p dir="ltr" style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, textAlign: "start" }}>
            {plan.start_year}–{plan.end_year}
          </p>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
