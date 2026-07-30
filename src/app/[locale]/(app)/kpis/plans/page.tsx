import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { NewStrategicPlanForm } from "@/components/NewStrategicPlanForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

interface PlanRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  start_year: number;
  end_year: number;
}

// Auth is enforced centrally by (app)/layout.tsx. Real write authorization
// is strategic_plans_insert's own check_vpra_global('strategicPlanning',
// 'approve') (20260730000001), strategy_admin-only. Rendering requires
// 'view', matching strategic_plans_select -- and the create form is shown
// only at 'approve', same page-level discipline as the goals screen (per
// CLAUDE.md §5-A rule 4, not UI-only protection).
export default async function StrategicPlansPage() {
  const t = await getTranslations("StrategicPlansPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(level, "view");
  const canCreate = hasVpraAccess(level, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data } = await supabase
    .from("strategic_plans")
    .select("id, name_ar, name_en, start_year, end_year")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  const plans = (data ?? []) as PlanRow[];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link
        href="/kpis/strategic-goals"
        className="sru-btn"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16, textDecoration: "none" }}
      >
        <ArrowRight size={15} aria-hidden className="sru-back-arrow" />
        {t("backButton")}
      </Link>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {plans.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 24 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 24 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnYears")}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      {plan.name_ar}
                      {plan.name_en && (
                        <span dir="ltr" style={{ display: "block", color: "var(--sru-muted)", fontSize: 12 }}>
                          {plan.name_en}
                        </span>
                      )}
                    </td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {plan.start_year}–{plan.end_year}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canCreate && <NewStrategicPlanForm />}
    </div>
  );
}
