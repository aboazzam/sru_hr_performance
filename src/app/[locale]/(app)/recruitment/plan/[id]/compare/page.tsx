import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import { computeDistribution } from "@/lib/recruitmentPlanAnalytics";
import { comparePlans } from "@/lib/recruitmentPlanComparison";
import type { Locale } from "@/i18n/config";

// مقارنة بالسنة السابقة، side by side per org unit.
//
// Which plan is "previous" is resolved in two steps: an explicit
// `previous_plan_id` link if one was set, otherwise the plan for
// `plan_year - 1`. The explicit link wins because a university may skip a
// year, and inferring "last year" would then silently compare against
// nothing while looking like it compared against something.
export default async function PlanComparePage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("RecruitmentComparePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: Partial<Record<ProcessArea, VpraLevel>> = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const canView =
    hasVpraAccess(permissions.recruitmentPlan ?? "none", "view") ||
    hasVpraAccess(permissions.recruitmentBudget ?? "none", "view");

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, name_ar, plan_year, previous_plan_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  let previous: { id: string; name_ar: string; plan_year: number } | null = null;
  if (canView && plan) {
    if (plan.previous_plan_id) {
      const { data } = await supabase
        .from("recruitment_plans")
        .select("id, name_ar, plan_year")
        .eq("id", plan.previous_plan_id)
        .is("deleted_at", null)
        .maybeSingle();
      previous = data ?? null;
    } else {
      const { data } = await supabase
        .from("recruitment_plans")
        .select("id, name_ar, plan_year")
        .eq("plan_year", plan.plan_year - 1)
        .is("deleted_at", null)
        .maybeSingle();
      previous = data ?? null;
    }
  }

  const loadItems = async (planId: string) => {
    const { data } = await supabase
      .from("recruitment_plan_items")
      .select("headcount, estimated_monthly_cost, org_units(name_ar)")
      .eq("plan_id", planId)
      .is("deleted_at", null);
    return ((data ?? []) as unknown as Array<{
      headcount: number;
      estimated_monthly_cost: number | null;
      org_units: { name_ar: string } | null;
    }>).map((row) => ({
      headcount: row.headcount,
      estimatedMonthlyCost: row.estimated_monthly_cost,
      groupKey: row.org_units?.name_ar ?? null,
      groupLabel: row.org_units?.name_ar ?? null,
    }));
  };

  const currentItems = canView && plan ? await loadItems(plan.id) : [];
  const previousItems = previous ? await loadItems(previous.id) : [];

  const rows = comparePlans(computeDistribution(currentItems), computeDistribution(previousItems));
  const currentTotals = computeRecruitmentPlanTotals(currentItems);
  const previousTotals = computeRecruitmentPlanTotals(previousItems);

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
  const delta = (value: number) => (value > 0 ? `+${formatNumber(value)}` : formatNumber(value));
  const deltaColor = (value: number) =>
    value > 0 ? "#b45309" : value < 0 ? "#15803d" : "var(--sru-muted)";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      {plan && (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
          {plan.name_ar} — {plan.plan_year}
        </p>
      )}
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <Link href={`/recruitment/plan/${id}`} className="sru-btn">
        {t("backToPlan")}
      </Link>

      <div style={{ marginTop: 20 }}>
        {!canView ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbidden")}</p>
        ) : !plan ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("planNotFound")}</p>
        ) : !previous ? (
          // Honest empty state: nothing to compare against is a real answer,
          // not an error, and not a table of zeroes pretending to be one.
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>
            {t("noPreviousPlan", { year: plan.plan_year - 1 })}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="sru-card">
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>
                    {t("headcountThisYear", { year: plan.plan_year })}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {formatNumber(currentTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>
                    {t("headcountLastYear", { year: previous.plan_year })}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {formatNumber(previousTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("headcountDelta")}</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: deltaColor(currentTotals.totalHeadcount - previousTotals.totalHeadcount),
                    }}
                  >
                    {delta(currentTotals.totalHeadcount - previousTotals.totalHeadcount)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("costDelta")}</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: deltaColor(currentTotals.totalAnnualCost - previousTotals.totalAnnualCost),
                    }}
                  >
                    {delta(currentTotals.totalAnnualCost - previousTotals.totalAnnualCost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="sru-card">
              <div className="table-scroll">
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("columnOrgUnit")}</th>
                      <th>{t("columnHeadcountPrev", { year: previous.plan_year })}</th>
                      <th>{t("columnHeadcountCurrent", { year: plan.plan_year })}</th>
                      <th>{t("columnHeadcountDelta")}</th>
                      <th>{t("columnCostPrev")}</th>
                      <th>{t("columnCostCurrent")}</th>
                      <th>{t("columnCostDelta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td className="sru-en">{formatNumber(row.previousHeadcount)}</td>
                        <td className="sru-en">{formatNumber(row.currentHeadcount)}</td>
                        <td className="sru-en" style={{ color: deltaColor(row.headcountDelta) }}>
                          {delta(row.headcountDelta)}
                        </td>
                        <td className="sru-en">{formatNumber(row.previousAnnualCost)}</td>
                        <td className="sru-en">{formatNumber(row.currentAnnualCost)}</td>
                        <td className="sru-en" style={{ color: deltaColor(row.annualCostDelta) }}>
                          {delta(row.annualCostDelta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
