import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  hasVpraAccess,
  evaluationStateLabels,
  evalTypeLabels,
  type EvaluationState,
  type EvalType,
  type ProcessArea,
  type VpraLevel,
} from "@/lib/vpra";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";

const COMPLETED_STATES = new Set(["approved", "finalized"]);

function achievementPercent(row: { target_value: number | null; actual_value: number | null }): number | null {
  if (row.actual_value == null || !row.target_value) return null;
  return Math.round((row.actual_value / row.target_value) * 100);
}

// Personalized dashboard (2026-07-25 rebuild): reachable by every logged-in
// user (no page-level gate — see navItems.ts), but its report-tab CONTENT
// is composed per user from their own permissions, each card checking the
// same process-area/level that already governs that data elsewhere in the
// app. A plain employee sees only their personal section; hr_admin/
// super_admin see nearly everything. Every query is additionally RLS-scoped
// as usual — an org-unit-scoped manager's "org-wide" cards still only
// reflect their own visible subset, same as every other page in this app.
//
// The project owner's exact request (2026-07-24) named several metrics —
// implemented all of them with real data below EXCEPT "نسبة تحقيق الأهداف
// الاستراتيجية" (% of strategic-goal achievement), which is deliberately
// NOT shown: `goals` has no column distinguishing a strategy-cascaded goal
// from any other assigned goal (see the same-day note on /evaluations
// needing to mature to track that distinction first) -- inventing a number
// here would be exactly the kind of fabricated metric this project's
// discipline forbids. Flagged in the UI instead of silently omitted.
//
// Restructured 2026-07-27 into three independently-gated tabs ("تقارير
// الأداء"/"تقارير الاستراتيجية"/"تقارير الجدارات"), per direct request:
// "اضف التقارير كعنوان في الصلاحيات ... تظهر كتبويبات في موديول التقارير
// وتضاف سكاشن في جدول الصلاحيات". The always-visible personal section
// (`personalContent`) was pulled OUT of any tab so gating the new
// performance tab can't take away a plain employee's own summary, which
// this page has shown unconditionally since 2026-07-25.
export default async function ReportsPage() {
  const t = await getTranslations("ReportsPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `user` can be null here even though (app)/layout.tsx's own getUser() call
  // already gated this route -- observed live for a background/prefetch
  // request that reached this page before the layout's redirect took effect.
  // Treat it the same as "no linked profile" (an already-handled state below)
  // rather than crash on `user!.id`.
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const myProfileId = myProfile?.id ?? null;

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const has = (area: ProcessArea, min: VpraLevel = "view") => hasVpraAccess(permissions[area] ?? "none", min);

  // ---- Personal section: always visible, filtered to my own profile id
  // explicitly (not left to each table's broader RLS branches), same
  // discipline as /evaluations/mine and /profile.
  let myEvaluation: { state: EvaluationState; evaluation_cycles: { name_ar: string } | null } | null = null;
  let myGoalsCount = 0;
  let myTasksCount = 0;
  if (myProfileId) {
    const [{ data: evalRows }, { count: goalsCount }, { count: tasksCount }] = await Promise.all([
      supabase
        .from("evaluations")
        .select("state, evaluation_cycles(name_ar)")
        .eq("employee_id", myProfileId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("goals").select("id", { count: "exact", head: true }).eq("employee_id", myProfileId),
      supabase.from("bau_tasks").select("id", { count: "exact", head: true }).eq("employee_id", myProfileId),
    ]);
    myEvaluation = (evalRows?.[0] as unknown as { state: EvaluationState; evaluation_cycles: { name_ar: string } | null }) ?? null;
    myGoalsCount = goalsCount ?? 0;
    myTasksCount = tasksCount ?? 0;
  }

  // ---- Permission-gated sections: only queried when the card would show.
  const showEvaluation = has("evaluation");
  const showCalibration = has("calibration");
  const showPromotions = has("promotions");
  const showVacancies = has("vacancies");
  const showEmployeeData = has("employeeData");
  const showStaffing = has("orgStructure") || has("staffing");
  const showUserManagement = has("userManagement");
  // "الرئيس التنفيذي يكون له صلاحية الاطلاع والمتابعة من خلال داشبورد
  // متابعة" — ceo (view) + strategy_admin (approve) both clear this;
  // deliberately the SAME `strategicPlanning` grant that gates the whole
  // module, not a broader `view`-for-everyone one (see the migration's own
  // header: real per-user cascade access is row-level, not this flat
  // grant — this specific ORG-WIDE oversight tab is the one place a flat
  // grant is actually the right shape, matching strategic_goals_select's
  // own check_vpra_global branch).
  const showStrategy = has("strategicPlanning");
  // New tab-level gates (2026-07-27), per direct request: "تضاف سكاشن في
  // جدول الصلاحيات" (added as sections in the permissions table) — these
  // decide whether the "تقارير الأداء"/"تقارير الجدارات" TABS appear at
  // all, on top of (not instead of) each card's own existing individual
  // gate inside `performanceContent` below.
  const showPerformanceReports = has("performanceReports");
  const showCompetencyReports = has("competencyReports");
  // Two more tab-level gates (2026-07-28), requested directly: "أضف لموديول
  // التقارير تاب خاص بالاعمال اليومية وتاب آخر بتقييم 360". Same pattern as
  // performanceReports/competencyReports -- separate from bauTasks/
  // evaluation (which gate DOING the work), no role_permissions seeded.
  const showBauTasksReports = has("bauTasksReports");
  const showFeedback360Reports = has("feedback360Reports");

  let completionRate: number | null = null;
  let completedEvaluations = 0;
  let totalEvaluations = 0;
  let incompleteOrgUnitNames: string[] = [];
  if (showEvaluation) {
    const { data: evaluationsData } = await supabase.from("evaluations").select("state, employee_id").is("deleted_at", null);
    const evaluations = (evaluationsData ?? []) as Array<{ state: string; employee_id: string }>;
    totalEvaluations = evaluations.length;
    completedEvaluations = evaluations.filter((e) => COMPLETED_STATES.has(e.state)).length;
    completionRate = totalEvaluations > 0 ? Math.round((completedEvaluations / totalEvaluations) * 100) : null;

    // Departments with at least one incomplete evaluation -- joined in JS
    // (profiles -> org_units) rather than a nested embed, matching this
    // app's established convention of resolving simple lookups via Maps.
    const incompleteEmployeeIds = [...new Set(evaluations.filter((e) => !COMPLETED_STATES.has(e.state)).map((e) => e.employee_id))];
    if (incompleteEmployeeIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("id, org_units(name_ar)").in("id", incompleteEmployeeIds);
      const profiles = (profilesData ?? []) as unknown as Array<{ id: string; org_units: { name_ar: string } | null }>;
      incompleteOrgUnitNames = [...new Set(profiles.map((p) => p.org_units?.name_ar).filter((n): n is string => !!n))].sort();
    }
  }

  let calibrationSessionsCount = 0;
  if (showCalibration) {
    const { count } = await supabase.from("calibration_sessions").select("id", { count: "exact", head: true }).is("deleted_at", null);
    calibrationSessionsCount = count ?? 0;
  }

  let promotionsCount = 0;
  let rewardsCount = 0;
  let developmentCount = 0;
  let separationCount = 0;
  if (showPromotions) {
    const [{ count: pCount }, { count: rCount }, { data: recommendationsData }] = await Promise.all([
      supabase.from("promotions").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("rewards").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("recommendations").select("type").is("deleted_at", null),
    ]);
    promotionsCount = pCount ?? 0;
    rewardsCount = rCount ?? 0;
    const recommendations = (recommendationsData ?? []) as Array<{ type: string }>;
    developmentCount = recommendations.filter((r) => r.type === "development").length;
    separationCount = recommendations.filter((r) => r.type === "separation").length;
  }

  let openVacancies = 0;
  if (showVacancies) {
    const { count } = await supabase.from("vacancies").select("id", { count: "exact", head: true }).eq("status", "open");
    openVacancies = count ?? 0;
  }

  let totalEmployees = 0;
  if (showEmployeeData) {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null);
    totalEmployees = count ?? 0;
  }

  let staffedPositions = 0;
  let totalPositions = 0;
  if (showStaffing) {
    const [{ count: posCount }, { data: assignmentsData }] = await Promise.all([
      supabase.from("org_structure_positions").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("org_structure_assignments").select("position_id").is("deleted_at", null),
    ]);
    totalPositions = posCount ?? 0;
    staffedPositions = new Set((assignmentsData ?? []).map((a) => a.position_id)).size;
  }

  let roleCounts: Array<{ name_ar: string; count: number }> = [];
  if (showUserManagement) {
    const [{ data: rolesData }, { data: userRolesData }] = await Promise.all([
      supabase.from("roles").select("id, name_ar").is("deleted_at", null),
      supabase.from("user_roles").select("user_id, role_id"),
    ]);
    const roles = (rolesData ?? []) as Array<{ id: string; name_ar: string }>;
    const userRoles = (userRolesData ?? []) as Array<{ user_id: string; role_id: string }>;
    const usersByRoleId = new Map<string, Set<string>>();
    for (const row of userRoles) {
      const set = usersByRoleId.get(row.role_id) ?? new Set<string>();
      set.add(row.user_id);
      usersByRoleId.set(row.role_id, set);
    }
    roleCounts = roles
      .map((r) => ({ name_ar: r.name_ar, count: usersByRoleId.get(r.id)?.size ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  interface StrategicGoalSummary {
    id: string;
    title_ar: string;
    target_value: number | null;
    actual_value: number | null;
    unit_ar: string;
    subGoalsCount: number;
  }
  let strategicGoalsSummary: StrategicGoalSummary[] = [];
  let subGoalsTotal = 0;
  let targetsTotal = 0;
  if (showStrategy) {
    const [{ data: goalsData }, { data: subGoalsData }, { count: targetsCount }] = await Promise.all([
      supabase.from("strategic_goals").select("id, title_ar, target_value, actual_value, unit_ar").is("deleted_at", null),
      supabase.from("sub_goals").select("id, strategic_goal_id").is("deleted_at", null),
      supabase.from("targets").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ]);
    const subGoals = (subGoalsData ?? []) as Array<{ id: string; strategic_goal_id: string }>;
    const subGoalCountByGoal = new Map<string, number>();
    for (const sg of subGoals) {
      subGoalCountByGoal.set(sg.strategic_goal_id, (subGoalCountByGoal.get(sg.strategic_goal_id) ?? 0) + 1);
    }
    strategicGoalsSummary = (
      (goalsData ?? []) as Array<{ id: string; title_ar: string; target_value: number | null; actual_value: number | null; unit_ar: string }>
    ).map((g) => ({ ...g, subGoalsCount: subGoalCountByGoal.get(g.id) ?? 0 }));
    subGoalsTotal = subGoals.length;
    targetsTotal = targetsCount ?? 0;
  }

  // ---- Competency Reports tab (2026-07-27): institutional framework
  // size only (pillars/domains/competencies/behavioral levels — real,
  // structural counts) plus per-employee competency-score coverage.
  // Deliberately does NOT invent a per-employee "average competency
  // score" narrative beyond that coverage count — evaluation_scores has
  // zero rows linked to a competency in production today (there are no
  // evaluation cycles yet at all), so a fabricated distribution would be
  // exactly the kind of invented metric this project's discipline forbids
  // (same reasoning already applied to the omitted "% أهداف استراتيجية
  // محققة" metric above). Each table here already carries its own
  // `competencyFramework`-based RLS — a caller holding `competencyReports`
  // without also holding `competencyFramework` will correctly see zero
  // rows, same documented "each table's own RLS decides" caveat as every
  // other cross-permission card on this page.
  let competencyPillarsCount = 0;
  let competencyDomainsCount = 0;
  let competencyCountsByType: Array<{ type: string; count: number }> = [];
  let competencyLevelsCount = 0;
  let competencyScoresRecorded = 0;
  if (showCompetencyReports) {
    const [{ count: pillarsCount }, { count: domainsCount }, { data: competenciesData }, { count: levelsCount }, { count: scoresCount }] =
      await Promise.all([
        supabase.from("competency_pillars").select("id", { count: "exact", head: true }),
        supabase.from("competency_domains").select("id", { count: "exact", head: true }),
        supabase.from("competencies").select("type").is("deleted_at", null),
        supabase.from("competency_levels").select("id", { count: "exact", head: true }),
        supabase.from("evaluation_scores").select("id", { count: "exact", head: true }).not("competency_id", "is", null),
      ]);
    competencyPillarsCount = pillarsCount ?? 0;
    competencyDomainsCount = domainsCount ?? 0;
    competencyLevelsCount = levelsCount ?? 0;
    competencyScoresRecorded = scoresCount ?? 0;
    const typeCounts = new Map<string, number>();
    for (const row of (competenciesData ?? []) as Array<{ type: string }>) {
      typeCounts.set(row.type, (typeCounts.get(row.type) ?? 0) + 1);
    }
    competencyCountsByType = [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }

  // ---- BAU Tasks Report tab (2026-07-28): no viewer-tiering was
  // requested for this tab (unlike the 360 tab below) -- a straightforward
  // aggregate over whatever `bau_tasks` rows are visible to the caller via
  // that table's own existing RLS (self-row / manager-approve-org-unit /
  // is_my_direct_report()), same "each table's own RLS decides" doctrine
  // already applied to every other card on this page. `status` has no
  // documented fixed vocabulary (same precedent as `goals.status`), so the
  // breakdown groups by whatever real values are actually present rather
  // than assuming any.
  let bauTasksTotal = 0;
  let bauTasksByStatus: Array<{ status: string; count: number }> = [];
  let bauTasksEmployeeCoverage = 0;
  if (showBauTasksReports) {
    const { data: tasksData } = await supabase.from("bau_tasks").select("employee_id, status").is("deleted_at", null);
    const tasks = (tasksData ?? []) as Array<{ employee_id: string; status: string }>;
    bauTasksTotal = tasks.length;
    const statusCounts = new Map<string, number>();
    for (const task of tasks) statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
    bauTasksByStatus = [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
    bauTasksEmployeeCoverage = new Set(tasks.map((task) => task.employee_id)).size;
  }

  // ---- 360 Feedback Report tab (2026-07-28): the three viewer tiers
  // requested directly ("على المستوى الفردي للموظف وعلى مستوى الادارة
  // لرئيس القسم او المكتب او مدير الادارة وعلى مستوى المنظمة للرئيس
  // التنفيذي") are NOT three separately-coded branches -- they emerge
  // naturally from feedback_360's own RLS once its oversight bar was
  // lowered from 'approve' to 'recommend' (migration 20260728000005,
  // mirroring evaluation_scores' identical 2026-07-19 fix): an org-unit-
  // scoped manager's visible rows are already confined to their own
  // department by RLS, while ceo/committee (scope='all') see everything --
  // so grouping whatever rows ARE visible by department and labeling the
  // resulting table "your department" (exactly one group) vs "the
  // organization" (more than one) reflects the real, RLS-enforced scope
  // rather than a role-name check that could drift out of sync with it.
  // The "individual" tier is a separate, always-attempted section (self as
  // target, explicit filter -- same discipline as /evaluations/mine) since
  // it doesn't depend on the oversight branch at all.
  interface Feedback360Row {
    id: string;
    evaluator_relation: string;
    scores: { overall_score?: number } | null;
    comments: string | null;
  }
  let myFeedback360: Feedback360Row[] = [];
  let myFeedback360Avg: number | null = null;
  let feedback360Breakdown: Array<{ orgUnitName: string; count: number; avgScore: number | null }> = [];
  let feedback360ScopeLabel: "department" | "organization" | null = null;
  if (showFeedback360Reports) {
    if (myProfileId) {
      const { data: myFbData } = await supabase
        .from("feedback_360")
        .select("id, evaluator_relation, scores, comments")
        .eq("target_employee_id", myProfileId)
        .is("deleted_at", null);
      myFeedback360 = (myFbData ?? []) as Feedback360Row[];
      const scores = myFeedback360.map((row) => row.scores?.overall_score).filter((s): s is number => typeof s === "number");
      myFeedback360Avg = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
    }

    const { data: allFbData } = await supabase
      .from("feedback_360")
      .select("id, target_employee_id, scores")
      .is("deleted_at", null)
      .neq("target_employee_id", myProfileId ?? "00000000-0000-0000-0000-000000000000");
    const allFb = (allFbData ?? []) as Array<{ id: string; target_employee_id: string; scores: { overall_score?: number } | null }>;
    if (allFb.length > 0) {
      const targetIds = [...new Set(allFb.map((row) => row.target_employee_id))];
      // profiles' own RLS may not resolve every target id for a caller who
      // holds only `evaluation` recommend/approve without a matching
      // `employeeData` grant -- same documented, independent-RLS caveat
      // already flagged elsewhere on this page (see the
      // recommendationsBreakdownHeading/history entries); unresolved
      // targets are simply excluded from the department breakdown below.
      const { data: profilesData } = await supabase.from("profiles").select("id, org_units(name_ar)").in("id", targetIds);
      const orgUnitByProfile = new Map<string, string>();
      for (const p of (profilesData ?? []) as unknown as Array<{ id: string; org_units: { name_ar: string } | null }>) {
        if (p.org_units?.name_ar) orgUnitByProfile.set(p.id, p.org_units.name_ar);
      }

      const groupedCounts = new Map<string, number>();
      const groupedScores = new Map<string, { sum: number; n: number }>();
      for (const row of allFb) {
        const unitName = orgUnitByProfile.get(row.target_employee_id);
        if (!unitName) continue;
        groupedCounts.set(unitName, (groupedCounts.get(unitName) ?? 0) + 1);
        const s = row.scores?.overall_score;
        if (typeof s === "number") {
          const cur = groupedScores.get(unitName) ?? { sum: 0, n: 0 };
          cur.sum += s;
          cur.n += 1;
          groupedScores.set(unitName, cur);
        }
      }
      feedback360Breakdown = [...groupedCounts.entries()]
        .map(([orgUnitName, count]) => {
          const s = groupedScores.get(orgUnitName);
          return { orgUnitName, count, avgScore: s ? Math.round(s.sum / s.n) : null };
        })
        .sort((a, b) => b.count - a.count);
      feedback360ScopeLabel = feedback360Breakdown.length === 1 ? "department" : feedback360Breakdown.length > 1 ? "organization" : null;
    }
  }

  const cardStyle: React.CSSProperties = { padding: 16, minWidth: 180 };
  const numberStyle: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--sru-muted)" };

  // Always visible regardless of any report-tab permission — a plain
  // employee has always seen their own evaluation/goals/tasks summary
  // here (see the module comment at the top of this file), and gating the
  // new "تقارير الأداء" tab must not take that away. Pulled out of the tab
  // content entirely (2026-07-27) rather than left inside the now-gated
  // performance tab.
  const personalContent = (
    <>
      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("myDashboardHeading")}
      </h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <div className="sru-card" style={cardStyle}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--sru-purple)" }}>
            {myEvaluation ? evaluationStateLabels[myEvaluation.state] : t("myEvaluationNone")}
          </div>
          <div style={labelStyle}>{myEvaluation?.evaluation_cycles?.name_ar ?? t("myEvaluationLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{myGoalsCount}</div>
          <div style={labelStyle}>{t("myGoalsLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{myTasksCount}</div>
          <div style={labelStyle}>{t("myTasksLabel")}</div>
        </div>
      </div>
    </>
  );

  const performanceContent = (
    <>
      {(showEvaluation || showCalibration || showPromotions || showVacancies || showEmployeeData || showStaffing) && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("orgWideHeading")}
          </h2>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            {showEvaluation && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>{completionRate != null ? `${completionRate}%` : "—"}</div>
                <div style={labelStyle}>{t("evaluationCompletionRate", { completed: completedEvaluations, total: totalEvaluations })}</div>
              </div>
            )}
            {showCalibration && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>{calibrationSessionsCount}</div>
                <div style={labelStyle}>{t("calibrationSessionsLabel")}</div>
              </div>
            )}
            {showPromotions && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>{promotionsCount + rewardsCount + developmentCount + separationCount}</div>
                <div style={labelStyle}>{t("totalRecommendations")}</div>
              </div>
            )}
            {showVacancies && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>{openVacancies}</div>
                <div style={labelStyle}>{t("openVacancies")}</div>
              </div>
            )}
            {showEmployeeData && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>{totalEmployees}</div>
                <div style={labelStyle}>{t("totalEmployeesLabel")}</div>
              </div>
            )}
            {showStaffing && (
              <div className="sru-card" style={cardStyle}>
                <div style={numberStyle}>
                  {staffedPositions}/{totalPositions}
                </div>
                <div style={labelStyle}>{t("staffingCoverageLabel")}</div>
              </div>
            )}
          </div>
        </>
      )}

      {showPromotions && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("recommendationsBreakdownHeading")}
          </h2>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("colTypePromotion")}</th>
                    <th>{t("colTypeReward")}</th>
                    <th>{t("colTypeDevelopment")}</th>
                    <th>{t("colTypeSeparation")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{promotionsCount}</td>
                    <td>{rewardsCount}</td>
                    <td>{developmentCount}</td>
                    <td>{separationCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showUserManagement && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("usersByRoleHeading")}
          </h2>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            {roleCounts.length === 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 14, padding: 16 }}>{t("usersByRoleEmpty")}</p>
            ) : (
              <div className="table-scroll">
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("roleColumn")}</th>
                      <th>{t("countColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleCounts.map((r) => (
                      <tr key={r.name_ar}>
                        <td>{r.name_ar}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showEvaluation && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("incompleteDepartmentsHeading")}
          </h2>
          {incompleteOrgUnitNames.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("incompleteDepartmentsEmpty")}</p>
          ) : (
            <ul style={{ marginBottom: 32, paddingInlineStart: 20 }}>
              {incompleteOrgUnitNames.map((name) => (
                <li key={name} style={{ fontSize: 14, marginBottom: 4 }}>
                  {name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );

  const competencyTypeLabels: Record<string, string> = {
    core: "المؤسسية",
    leadership: "القيادية",
    specialized: "التخصصية",
  };

  const competencyContent = (
    <>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("competencySubtitle")}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{competencyPillarsCount}</div>
          <div style={labelStyle}>{t("competencyPillarsLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{competencyDomainsCount}</div>
          <div style={labelStyle}>{t("competencyDomainsLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{competencyCountsByType.reduce((sum, c) => sum + c.count, 0)}</div>
          <div style={labelStyle}>{t("competencyTotalLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{competencyLevelsCount}</div>
          <div style={labelStyle}>{t("competencyLevelsLabel")}</div>
        </div>
      </div>

      {competencyCountsByType.length > 0 && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("competencyByTypeHeading")}
          </h2>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("competencyTypeColumn")}</th>
                    <th>{t("countColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {competencyCountsByType.map((row) => (
                    <tr key={row.type}>
                      <td>{competencyTypeLabels[row.type] ?? row.type}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>
        {competencyScoresRecorded > 0
          ? t("competencyScoresRecorded", { count: competencyScoresRecorded })
          : t("competencyNoEmployeeData")}
      </p>
    </>
  );

  const strategyContent = (
    <>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("strategySubtitle")}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{strategicGoalsSummary.length}</div>
          <div style={labelStyle}>{t("strategyGoalsCount")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{subGoalsTotal}</div>
          <div style={labelStyle}>{t("strategySubGoalsCount")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{targetsTotal}</div>
          <div style={labelStyle}>{t("strategyTargetsCount")}</div>
        </div>
      </div>

      {strategicGoalsSummary.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("strategyEmpty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("strategyColumnTitle")}</th>
                  <th>{t("strategyColumnTarget")}</th>
                  <th>{t("strategyColumnActual")}</th>
                  <th>{t("strategyColumnAchievement")}</th>
                  <th>{t("strategyColumnSubGoals")}</th>
                </tr>
              </thead>
              <tbody>
                {strategicGoalsSummary.map((goal) => (
                  <tr key={goal.id}>
                    <td>{goal.title_ar}</td>
                    <td>
                      {goal.target_value ?? "—"} {goal.unit_ar}
                    </td>
                    <td>
                      {goal.actual_value ?? "—"} {goal.unit_ar}
                    </td>
                    <td>{achievementPercent(goal) != null ? `${achievementPercent(goal)}%` : "—"}</td>
                    <td>{goal.subGoalsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );

  const bauTasksContent = (
    <>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("bauTasksSubtitle")}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{bauTasksTotal}</div>
          <div style={labelStyle}>{t("bauTasksTotalLabel")}</div>
        </div>
        <div className="sru-card" style={cardStyle}>
          <div style={numberStyle}>{bauTasksEmployeeCoverage}</div>
          <div style={labelStyle}>{t("bauTasksEmployeeCoverageLabel")}</div>
        </div>
      </div>

      {bauTasksByStatus.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("bauTasksEmpty")}</p>
      ) : (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("bauTasksByStatusHeading")}
          </h2>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("bauTasksStatusColumn")}</th>
                    <th>{t("countColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bauTasksByStatus.map((row) => (
                    <tr key={row.status}>
                      <td>{row.status}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );

  const feedback360Content = (
    <>
      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("feedback360MyResultsHeading")}
      </h2>
      {myFeedback360.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("feedback360MyResultsEmpty")}</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="sru-card" style={cardStyle}>
              <div style={numberStyle}>{myFeedback360.length}</div>
              <div style={labelStyle}>{t("feedback360SubmissionsCount")}</div>
            </div>
            <div className="sru-card" style={cardStyle}>
              <div style={numberStyle}>{myFeedback360Avg != null ? `${myFeedback360Avg}%` : "—"}</div>
              <div style={labelStyle}>{t("feedback360AverageScore")}</div>
            </div>
          </div>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("feedback360RelationColumn")}</th>
                    <th>{t("feedback360ScoreColumn")}</th>
                    <th>{t("feedback360CommentColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {myFeedback360.map((row) => (
                    <tr key={row.id}>
                      <td>{evalTypeLabels[row.evaluator_relation as EvalType] ?? row.evaluator_relation}</td>
                      <td>{row.scores?.overall_score ?? "—"}</td>
                      <td>{row.comments ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {feedback360Breakdown.length > 0 && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {feedback360ScopeLabel === "department" ? t("feedback360DepartmentHeading") : t("feedback360OrganizationHeading")}
          </h2>
          <div className="sru-card" style={{ marginBottom: 32 }}>
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("feedback360DepartmentColumn")}</th>
                    <th>{t("countColumn")}</th>
                    <th>{t("feedback360AverageScore")}</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback360Breakdown.map((row) => (
                    <tr key={row.orgUnitName}>
                      <td>{row.orgUnitName}</td>
                      <td>{row.count}</td>
                      <td>{row.avgScore != null ? `${row.avgScore}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );

  // Reports tabs (2026-07-27): three independently-gated report
  // categories, each its own row in the /admin permission matrix. Only
  // "تقارير الأداء"/"تقارير الجدارات" are NEW gates (`performanceReports`/
  // `competencyReports`) -- "تقارير الاستراتيجية" reuses the already-
  // existing `strategicPlanning` grant (see vpra.ts's own comment for why
  // a third, redundant area wasn't added). Zero, one, or several tabs may
  // be visible depending on the caller's own grants; the tab bar itself
  // (ProfileTabs) is only rendered when there's genuinely more than one to
  // switch between, same discipline this page already used before today.
  const reportTabs: ProfileTab[] = [];
  if (showPerformanceReports) reportTabs.push({ id: "performance", label: t("performanceTab"), content: performanceContent });
  if (showStrategy) reportTabs.push({ id: "strategy", label: t("strategyTab"), content: strategyContent });
  if (showCompetencyReports) reportTabs.push({ id: "competency", label: t("competencyTab"), content: competencyContent });
  if (showBauTasksReports) reportTabs.push({ id: "bauTasks", label: t("bauTasksTab"), content: bauTasksContent });
  if (showFeedback360Reports) reportTabs.push({ id: "feedback360", label: t("feedback360Tab"), content: feedback360Content });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {personalContent}

      {reportTabs.length > 1 ? (
        <ProfileTabs tabs={reportTabs} />
      ) : reportTabs.length === 1 ? (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {reportTabs[0].label}
          </h2>
          {reportTabs[0].content}
        </>
      ) : null}
    </div>
  );
}
