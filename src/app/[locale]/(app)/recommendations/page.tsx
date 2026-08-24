import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { CreateRecommendationForm } from "@/components/CreateRecommendationForm";
import { RecommendationReviewActions } from "@/components/RecommendationReviewActions";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Hub page for the project owner's "التوصيات" concept (2026-07-24):
// promotion and reward recommendations keep using their own established
// /promotions and /rewards flows (linked here, not rebuilt) -- this page
// hosts only the two types with no existing table, development and
// separation, via the new `recommendations` table (migration 20260724000005).
//
// The counts/list below are already RLS-scoped safely (recommendations_select
// mirrors promotions/rewards' own self-row/org-scoped bar) — the gap was the
// inline create form: recommendations_insert requires
// check_vpra('promotions','recommend', org_unit_id), the same bar as
// /promotions/new and /rewards/new, but this form had no matching page-level
// check and was reachable by any authenticated user (same bug class found in
// the audit that fixed kpis/strategic-goals).
export default async function RecommendationsPage() {
  const t = await getTranslations("RecommendationsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const promotionsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "rewardsAndRecommendations"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(promotionsLevel, "recommend");

  // Each count query is RLS-scoped to the caller on its own terms -- a
  // caller who can't see promotions/rewards/recommendations at all simply
  // gets 0 here, same as every list page in this app.
  const [{ count: promotionsCount }, { count: rewardsCount }, { data: recsData }] = await Promise.all([
    supabase.from("promotions").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("rewards").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("recommendations")
      .select(
        "id, type, reasoning, status, employee:profiles!recommendations_employee_id_fkey(employee_number,full_name_ar), evaluation_cycles(name_ar)"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const recommendations = recsData as unknown as Array<{
    id: string;
    type: "development" | "separation";
    reasoning: string | null;
    status: string;
    employee: { employee_number: string; full_name_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  const developmentCount = (recommendations ?? []).filter((r) => r.type === "development").length;
  const separationCount = (recommendations ?? []).filter((r) => r.type === "separation").length;

  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
    .is("deleted_at", null)
    .order("employee_number");
  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const typeLabels: Record<string, string> = {
    development: t("typeDevelopment"),
    separation: t("typeSeparation"),
  };

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="evaluationResults" current="recommendations" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <Link href="/promotions" className="sru-card" style={{ padding: 16, minWidth: 160, textDecoration: "none" }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "var(--sru-purple)" }}>{promotionsCount ?? 0}</div>
          <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("typePromotion")}</div>
        </Link>
        <Link href="/rewards" className="sru-card" style={{ padding: 16, minWidth: 160, textDecoration: "none" }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "var(--sru-purple)" }}>{rewardsCount ?? 0}</div>
          <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("typeReward")}</div>
        </Link>
        <div className="sru-card" style={{ padding: 16, minWidth: 160 }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "var(--sru-purple)" }}>{developmentCount}</div>
          <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("typeDevelopment")}</div>
        </div>
        <div className="sru-card" style={{ padding: 16, minWidth: 160 }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "var(--sru-purple)" }}>{separationCount}</div>
          <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("typeSeparation")}</div>
        </div>
      </div>

      <h2 className="sru-title" style={{ fontSize: 16, marginBottom: 12 }}>
        {t("newRecommendationHeading")}
      </h2>
      {canCreate && employees && employees.length > 0 ? (
        <CreateRecommendationForm employees={employees} cycles={cycles ?? []} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      )}

      <h2 className="sru-title" style={{ fontSize: 16, margin: "32px 0 12px" }}>
        {t("listHeading")}
      </h2>
      {!recommendations || recommendations.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnType")}</th>
                  <th>{t("columnReasoning")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => (
                  <tr key={rec.id}>
                    <td>
                      {rec.employee?.employee_number} — {rec.employee?.full_name_ar}
                    </td>
                    <td>{rec.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{typeLabels[rec.type]}</td>
                    <td>{rec.reasoning ?? "—"}</td>
                    <td>{rec.status}</td>
                    <td>{rec.status === "pending" && <RecommendationReviewActions recommendationId={rec.id} />}</td>
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
