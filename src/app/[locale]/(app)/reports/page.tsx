import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasVpraAccess, evaluationStateLabels, type EvaluationState, type ProcessArea, type VpraLevel } from "@/lib/vpra";

const COMPLETED_STATES = new Set(["approved", "finalized"]);

// Personalized dashboard (2026-07-25 rebuild): reachable by every logged-in
// user (no page-level gate — see navItems.ts), but its CONTENT is composed
// per user from their own permissions, each card checking the same
// process-area/level that already governs that data elsewhere in the app.
// A plain employee sees only their personal section; hr_admin/super_admin
// see nearly everything. Every query is additionally RLS-scoped as usual —
// an org-unit-scoped manager's "org-wide" cards still only reflect their
// own visible subset, same as every other page in this app.
//
// The project owner's exact request (2026-07-24) named several metrics —
// implemented all of them with real data below EXCEPT "نسبة تحقيق الأهداف
// الاستراتيجية" (% of strategic-goal achievement), which is deliberately
// NOT shown: `goals` has no column distinguishing a strategy-cascaded goal
// from any other assigned goal (see the same-day note on /evaluations
// needing to mature to track that distinction first) -- inventing a number
// here would be exactly the kind of fabricated metric this project's
// discipline forbids. Flagged in the UI instead of silently omitted.
export default async function ReportsPage() {
  const t = await getTranslations("ReportsPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user!.id).maybeSingle();
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

  const cardStyle: React.CSSProperties = { padding: 16, minWidth: 180 };
  const numberStyle: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--sru-muted)" };

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

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

          <div className="sru-card" style={{ padding: 16, background: "var(--sru-purple-light)" }}>
            <p style={{ fontSize: 13, color: "var(--sru-ink)" }}>{t("strategicGoalsNotAvailable")}</p>
          </div>
        </>
      )}
    </div>
  );
}
