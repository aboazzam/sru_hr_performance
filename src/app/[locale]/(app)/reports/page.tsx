import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

const COMPLETED_STATES = new Set(["approved", "finalized"]);

// Auth is enforced centrally by (app)/layout.tsx. Every query below is
// RLS-scoped to the caller on its own terms, same as every other page in
// this app -- an org-unit-scoped manager sees aggregate numbers reflecting
// only their own visible subset, not a project-wide total; that's the
// correct, existing RLS behavior, not something this page overrides.
//
// The project owner's exact request (2026-07-24) named several metrics —
// implemented all of them with real data below EXCEPT "نسبة تحقيق
// الأهداف الاستراتيجية" (% of strategic-goal achievement), which is
// deliberately NOT shown: `goals` has no column distinguishing a
// strategy-cascaded goal from any other assigned goal (see the same-day
// note on /evaluations needing to mature to track that distinction first)
// -- inventing a number here would be exactly the kind of fabricated
// metric this project's discipline forbids. Flagged in the UI instead of
// silently omitted.
//
// 2026-07-25 follow-up: moved into the "الإدارة" module and gated on its
// own dedicated `reports` process area (migration 20260725000006) instead
// of piggybacking on `evaluation` -- "بحيث عند الاتاحة للمشاهدة يطلع على
// الارقام الخاصة به" (the numbers should only show once view access is
// explicitly granted). Seeded with zero role_permissions rows, so every
// role sees the "no permission" message below until the project owner
// grants `reports=view`+ from /admin's role editor.
export default async function ReportsPage() {
  const t = await getTranslations("ReportsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const reportsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find((row) => row.process_area === "reports")
      ?.vpra_level ?? "none";
  const canView = hasVpraAccess(reportsLevel, "view");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="administration" current="reports" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const [{ count: openVacancies }, { data: evaluationsData }, { count: promotionsCount }, { count: rewardsCount }, { data: recommendationsData }] =
    await Promise.all([
      supabase.from("vacancies").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("evaluations").select("state, employee_id").is("deleted_at", null),
      supabase.from("promotions").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("rewards").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("recommendations").select("type").is("deleted_at", null),
    ]);

  const evaluations = (evaluationsData ?? []) as Array<{ state: string; employee_id: string }>;
  const totalEvaluations = evaluations.length;
  const completedEvaluations = evaluations.filter((e) => COMPLETED_STATES.has(e.state)).length;
  const completionRate = totalEvaluations > 0 ? Math.round((completedEvaluations / totalEvaluations) * 100) : null;

  // Departments with at least one incomplete evaluation -- joined in JS
  // (profiles -> org_units) rather than a nested embed, matching this
  // app's established convention of resolving simple lookups via Maps.
  const incompleteEmployeeIds = [...new Set(evaluations.filter((e) => !COMPLETED_STATES.has(e.state)).map((e) => e.employee_id))];
  let incompleteOrgUnitNames: string[] = [];
  if (incompleteEmployeeIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, org_units(name_ar)")
      .in("id", incompleteEmployeeIds);
    const profiles = (profilesData ?? []) as unknown as Array<{ id: string; org_units: { name_ar: string } | null }>;
    incompleteOrgUnitNames = [...new Set(profiles.map((p) => p.org_units?.name_ar).filter((n): n is string => !!n))].sort();
  }

  const recommendations = (recommendationsData ?? []) as Array<{ type: string }>;
  const developmentCount = recommendations.filter((r) => r.type === "development").length;
  const separationCount = recommendations.filter((r) => r.type === "separation").length;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="reports" />
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <div className="sru-card" style={{ padding: 16, minWidth: 180 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" }}>{openVacancies ?? 0}</div>
          <div style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("openVacancies")}</div>
        </div>
        <div className="sru-card" style={{ padding: 16, minWidth: 180 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" }}>
            {completionRate != null ? `${completionRate}%` : "—"}
          </div>
          <div style={{ fontSize: 13, color: "var(--sru-muted)" }}>
            {t("evaluationCompletionRate", { completed: completedEvaluations, total: totalEvaluations })}
          </div>
        </div>
        <div className="sru-card" style={{ padding: 16, minWidth: 180 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--sru-purple)" }}>
            {(promotionsCount ?? 0) + (rewardsCount ?? 0) + developmentCount + separationCount}
          </div>
          <div style={{ fontSize: 13, color: "var(--sru-muted)" }}>{t("totalRecommendations")}</div>
        </div>
      </div>

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
                <td>{promotionsCount ?? 0}</td>
                <td>{rewardsCount ?? 0}</td>
                <td>{developmentCount}</td>
                <td>{separationCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}
