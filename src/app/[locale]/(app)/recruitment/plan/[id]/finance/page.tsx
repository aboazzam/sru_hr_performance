import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { FinanceReviewPanel } from "@/components/FinanceReviewPanel";
import { PlanProgressBar } from "@/components/PlanProgressBar";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import { computeBudgetVariance } from "@/lib/recruitmentPlanAnalytics";
import type { RecruitmentPermissions } from "@/lib/recruitmentWorkflow";
import type { Locale } from "@/i18n/config";

// شاشة المراجعة المالية. Gated at `recruitmentBudget>=recommend` — the area
// added in 20260807000001 precisely so this seat can be granted from /admin
// to a role that holds nothing on `recruitmentPlan` at all.
export default async function PlanFinanceReviewPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("RecruitmentFinancePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const canReview = hasVpraAccess(permissions.recruitmentBudget ?? "none", "recommend");

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select(
      "id, name_ar, plan_year, status, approved_budget, finance_note, finance_reviewed_at, hr_recommendation"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: items } = await supabase
    .from("recruitment_plan_items")
    .select("headcount, estimated_monthly_cost")
    .eq("plan_id", id)
    .is("deleted_at", null);

  const totals = computeRecruitmentPlanTotals(
    (items ?? []).map((i) => ({
      headcount: i.headcount,
      estimatedMonthlyCost: i.estimated_monthly_cost,
    }))
  );
  const budget = computeBudgetVariance(totals.totalAnnualCost, plan?.approved_budget ?? null);
  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      {/* Title on the reading side, the way out opposite it — the same header
          shape the plan page itself uses. It used to sit under the divider as
          a bare link, easy to miss on a screen whose whole job is one save. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          {plan && (
            <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
              {plan.name_ar} — {plan.plan_year}
            </p>
          )}
        </div>
        <Link href={`/recruitment/plan/${id}`} className="sru-btn">
          {t("backToPlan")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <div style={{ marginTop: 20 }}>
        {!canReview ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbidden")}</p>
        ) : !plan ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("planNotFound")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="sru-card">
              {/* `financeReviewed` matters most on THIS screen: the reviewer
                  saves here, and the bar is the first thing they look at to
                  confirm it registered. Omitting it left the bar saying «قيد
                  المراجعة المالية» directly beside «تم حفظ المراجعة المالية»
                  — reported right after a real review was recorded. */}
              <PlanProgressBar
                status={plan.status}
                financeReviewed={plan.finance_reviewed_at !== null}
              />
            </div>

            <div className="sru-card">
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("totalHeadcount")}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {formatNumber(totals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("totalAnnualCost")}</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {formatNumber(totals.totalAnnualCost)}
                  </div>
                </div>
              </div>
              {totals.itemsWithoutCost > 0 && (
                <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 10 }}>
                  {t("itemsWithoutCostNote", { count: totals.itemsWithoutCost })}
                </p>
              )}
              {plan.hr_recommendation && (
                <p style={{ fontSize: 12.5, marginTop: 10 }}>
                  <span style={{ color: "var(--sru-muted)" }}>{t("hrRecommendationLabel")} </span>
                  {plan.hr_recommendation}
                </p>
              )}
            </div>

            <FinanceReviewPanel
              planId={plan.id}
              status={plan.status}
              permissions={permissions}
              totalAnnualCost={totals.totalAnnualCost}
              initialApprovedBudget={plan.approved_budget}
              initialFinanceNote={plan.finance_note ?? ""}
              alreadyReviewed={plan.finance_reviewed_at !== null}
              initialVarianceStatus={budget.status}
            />
          </div>
        )}
      </div>
    </div>
  );
}
