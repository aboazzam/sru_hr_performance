import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { NewStrategicPlanForm } from "@/components/NewStrategicPlanForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
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
// 'approve') (20260730000001), strategy_admin-only.
//
// Viewing is deliberately UNGATED (2026-08-01, same "vision/mission opened
// to everyone" precedent from 20260730000004): this page previously
// required strategicPlanning>='view', which only 2-3 roles hold, making it
// an unreachable dead end for everyone else -- directly contradicting the
// explicit request that clicking the sidebar's "الخطة الاستراتيجية" button
// should always open "قائمة بالخطط الاستراتيجية". Only the create-plan
// form stays gated at 'approve', matching strategic_plans_insert's own RLS
// (per CLAUDE.md §5-A rule 4, not UI-only protection).
export default async function StrategicPlansPage() {
  const t = await getTranslations("StrategicPlansPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(level, "approve");

  const { data } = await supabase
    .from("strategic_plans")
    .select("id, name_ar, name_en, start_year, end_year")
    .is("deleted_at", null)
    .order("start_year", { ascending: false });
  const plans = (data ?? []) as PlanRow[];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="strategicPlan" current="kpis/plans" />
      {/* Trigger sits to the LEFT of the title and slightly below it
          (2026-08-19 request) -- alignItems: flex-end lines it up with the
          subtitle rather than the heading, and it wraps underneath on
          narrow screens. */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canCreate && <NewStrategicPlanForm />}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {plans.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
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
                      <Link href={`/kpis/plans/${plan.id}`} style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                        {plan.name_ar}
                      </Link>
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

    </div>
  );
}
