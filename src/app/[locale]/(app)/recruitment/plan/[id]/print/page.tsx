import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/BackLink";
import { PrintButton } from "@/components/PrintButton";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import { computeBudgetVariance } from "@/lib/recruitmentPlanAnalytics";
import { planStatusLabelFor } from "@/lib/recruitmentWorkflow";
import { getDisplayTimezone } from "@/lib/systemSettings";
import type { Locale } from "@/i18n/config";

// صفحة طباعة الخطة (PDF عبر طباعة المتصفح).
//
// No PDF library is introduced: this project has none, `sru-print.css` exists
// for exactly this, and every other printable surface here (the employees
// list) already goes through window.print(). Adding a rendering dependency
// for one screen would be a real cost for no gain the browser doesn't give.
//
// Lives UNDER the (app) group on purpose, so the single centralized auth gate
// still applies; the shell chrome is hidden by the @media print rules added
// to globals.css rather than by moving this page outside that gate.
export default async function PlanPrintPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("RecruitmentPrintPage");
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
    .select(
      "id, name_ar, plan_year, status, notes, approved_budget, hr_recommendation, finance_note, finance_reviewed_at, approval_note, approved_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: itemData } = canView
    ? await supabase
        .from("recruitment_plan_items")
        .select(
          "id, headcount, target_quarter, priority, estimated_monthly_cost, status, org_units(name_ar), job_titles(name_ar, grade_level)"
        )
        .eq("plan_id", id)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  const items = (itemData ?? []) as unknown as Array<{
    id: string;
    headcount: number;
    target_quarter: number | null;
    priority: string | null;
    estimated_monthly_cost: number | null;
    status: string;
    org_units: { name_ar: string } | null;
    job_titles: { name_ar: string; grade_level: number } | null;
  }>;

  const totals = computeRecruitmentPlanTotals(
    items.map((i) => ({ headcount: i.headcount, estimatedMonthlyCost: i.estimated_monthly_cost }))
  );
  const budget = computeBudgetVariance(totals.totalAnnualCost, plan?.approved_budget ?? null);
  const timeZone = await getDisplayTimezone(supabase);
  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const printedAt = new Date().toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", { timeZone });

  if (!canView || !plan) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("forbidden")}</p>
      </div>
    );
  }

  return (
    <div className="sru-container" style={{ padding: "24px 22px 60px" }}>
      <div className="no-print" style={{ marginBottom: 10 }}>
        <BackLink href={`/recruitment/plan/${id}`}>{t("backToPlan")}</BackLink>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        {/* The shared PrintButton reads its own label from the `PrintButton`
            message namespace — used unchanged by 8 other screens, so it takes
            no props. */}
        <PrintButton />
      </div>

      {/* ترويسة الطباعة */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "2px solid var(--sru-purple)",
          paddingBottom: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{t("documentTitle")}</h1>
          <p style={{ fontSize: 12, margin: "4px 0 0", color: "var(--sru-muted)" }}>
            {plan.name_ar} — {plan.plan_year} —{" "}
            {planStatusLabelFor(plan.status, { financeReviewed: plan.finance_reviewed_at !== null })}
          </p>
        </div>
        <Image src="/sru-logo.png" alt="جامعة سليمان الراجحي" width={110} height={40} style={{ height: 40, width: "auto" }} />
      </header>

      <section style={{ marginTop: 16, display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sru-muted)" }}>{t("totalHeadcount")}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatNumber(totals.totalHeadcount)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--sru-muted)" }}>{t("totalAnnualCost")}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatNumber(totals.totalAnnualCost)}</div>
        </div>
        {budget.status !== "no_budget" && (
          <>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--sru-muted)" }}>{t("approvedBudget")}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {formatNumber(budget.approvedBudget ?? 0)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "var(--sru-muted)" }}>{t("variance")}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{formatNumber(budget.variance ?? 0)}</div>
            </div>
          </>
        )}
      </section>

      {totals.itemsWithoutCost > 0 && (
        <p style={{ fontSize: 11, color: "var(--sru-muted)", marginTop: 8 }}>
          {t("itemsWithoutCostNote", { count: totals.itemsWithoutCost })}
        </p>
      )}

      <table className="admin-matrix" style={{ marginTop: 16, fontSize: 11.5 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("columnJobTitle")}</th>
            <th>{t("columnOrgUnit")}</th>
            <th>{t("columnHeadcount")}</th>
            <th>{t("columnQuarter")}</th>
            <th>{t("columnMonthlyCost")}</th>
            <th>{t("columnAnnualCost")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id}>
              <td className="sru-en">{index + 1}</td>
              <td>{item.job_titles?.name_ar ?? "—"}</td>
              <td>{item.org_units?.name_ar ?? "—"}</td>
              <td className="sru-en">{formatNumber(item.headcount)}</td>
              <td className="sru-en">{item.target_quarter ? `Q${item.target_quarter}` : "—"}</td>
              <td className="sru-en">
                {item.estimated_monthly_cost === null
                  ? "—"
                  : formatNumber(item.estimated_monthly_cost * item.headcount)}
              </td>
              <td className="sru-en">
                {item.estimated_monthly_cost === null
                  ? "—"
                  : formatNumber(item.estimated_monthly_cost * item.headcount * 12)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(plan.hr_recommendation || plan.finance_note || plan.approval_note) && (
        <section style={{ marginTop: 18, fontSize: 11.5, lineHeight: 2 }}>
          {plan.hr_recommendation && (
            <p>
              <strong>{t("hrRecommendation")}</strong> {plan.hr_recommendation}
            </p>
          )}
          {plan.finance_note && (
            <p>
              <strong>{t("financeNote")}</strong> {plan.finance_note}
            </p>
          )}
          {plan.approval_note && (
            <p>
              <strong>{t("approvalNote")}</strong> {plan.approval_note}
            </p>
          )}
        </section>
      )}

      {/* تذييل الطباعة */}
      <footer
        style={{
          marginTop: 28,
          paddingTop: 10,
          borderTop: "1px solid var(--sru-border)",
          fontSize: 10.5,
          color: "var(--sru-muted)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span>{t("footerOrg")}</span>
        <span className="sru-en">{printedAt}</span>
      </footer>
    </div>
  );
}
