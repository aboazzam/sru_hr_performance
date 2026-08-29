import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/BackLink";
import { PlanDistributionCard } from "@/components/PlanDistributionCard";
import { RecruitmentPlanWindowsCard } from "@/components/RecruitmentPlanWindowsCard";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import { RecruitmentPlanExportMenu } from "@/components/RecruitmentPlanExportMenu";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { RecruitmentPlanHeaderActions } from "@/components/RecruitmentPlanHeaderActions";
import { AddRecruitmentPlanItemForm } from "@/components/AddRecruitmentPlanItemForm";
import { RecruitmentPlanItemRow } from "@/components/RecruitmentPlanItemRow";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import {
  computeBudgetVariance,
  computeDistribution,
  contractTypeLabel,
  quarterLabel,
} from "@/lib/recruitmentPlanAnalytics";
import { PlanWorkflowActions } from "@/components/PlanWorkflowActions";
import { PlanProgressBar } from "@/components/PlanProgressBar";
import { planStatusLabelFor, type RecruitmentPermissions } from "@/lib/recruitmentWorkflow";
import type { Locale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx.
//
// Every embed below (org_units / job_titles / org_structure_positions /
// vacancies) is a single, unambiguous FK — verified against the real
// database with a temporary row BEFORE writing this query (returned as
// single objects, `vacancies` null when unpublished), the same habit that
// caught the org_units embed bug on the employees list.
export default async function RecruitmentPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations("RecruitmentPlanPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const level = permissions.recruitmentPlan ?? "none";
  // Finance reaches this page through its own area, holding no
  // `recruitmentPlan` grant at all — same shape as the requests screen.
  const canReviewBudget = hasVpraAccess(permissions.recruitmentBudget ?? "none", "recommend");
  const canView = hasVpraAccess(level, "view") || canReviewBudget;
  const canPrepare = hasVpraAccess(level, "prepare");
  // HR's own tier — VPRA's "submit/recommend upward" — which is what
  // separates consolidating a plan from merely raising a request.
  const canConsolidate = hasVpraAccess(level, "recommend");
  // ضبط زمن الخطة تحريرٌ لها، فحدُّه هو حدّ `recruitment_plans_update`
  // نفسه — و RLS هي البوابة الفعلية على أي حال؛ هذا يخفي النموذج فقط
  // عمّن سيُردّ حفظه.
  const canEditWindows = hasVpraAccess(level, "prepare");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 20 }}>
          {t("title")}
        </h1>
        <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
        <GroupTabs groupKey="recruitment" current="recruitment/plan" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 24 }}>{t("forbidden")}</p>
      </div>
    );
  }

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select(
      "id, name_ar, plan_year, status, notes, approved_at, approved_budget, finance_note, finance_reviewed_at, hr_recommendation, submitted_at, requests_open_at, requests_close_at, plan_start_date, plan_end_date"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!plan) notFound();

  // اليوم بتوقيت العرض المضبوط في النظام لا بتوقيت الخادم: حالة النافذة
  // تُقاس بيوم المنظمة، وحسابه في المتصفح كان سيختلف بين رسم الخادم ورسمه.
  const today = todayInTimezone(await getDisplayTimezone(supabase));

  const { data: itemData } = await supabase
    .from("recruitment_plan_items")
    .select(
      "id, headcount, target_quarter, priority, estimated_monthly_cost, justification, status, vacancy_id, request_id, org_units(name_ar), job_titles(name_ar,grade_level), org_structure_positions(name_ar)"
    )
    .eq("plan_id", id)
    .is("deleted_at", null)
    .order("created_at");

  const items = (itemData ?? []) as unknown as Array<{
    id: string;
    headcount: number;
    target_quarter: number | null;
    priority: string | null;
    estimated_monthly_cost: number | null;
    justification: string | null;
    status: string;
    vacancy_id: string | null;
    request_id: string | null;
    org_units: { name_ar: string } | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_structure_positions: { name_ar: string } | null;
  }>;

  const totals = computeRecruitmentPlanTotals(
    items.map((i) => ({ headcount: i.headcount, estimatedMonthlyCost: i.estimated_monthly_cost }))
  );

  // Contract type lives on the REQUEST, not the item (an item imported from
  // the org chart has no request and therefore no contract type — it falls
  // into the "غير محدد" bucket rather than being dropped from the chart).
  const requestIds = items.map((i) => i.request_id).filter(Boolean) as string[];
  const { data: linkedRequests } = requestIds.length
    ? await supabase
        .from("recruitment_requests")
        .select("id, contract_type")
        .in("id", requestIds)
    : { data: [] };
  const contractByRequest = new Map((linkedRequests ?? []).map((r) => [r.id, r.contract_type]));

  const costOf = (item: (typeof items)[number]) => ({
    headcount: item.headcount,
    estimatedMonthlyCost: item.estimated_monthly_cost,
  });

  const budget = computeBudgetVariance(totals.totalAnnualCost, plan.approved_budget);
  const byOrgUnit = computeDistribution(
    items.map((i) => ({
      ...costOf(i),
      groupKey: i.org_units?.name_ar ?? null,
      groupLabel: i.org_units?.name_ar ?? null,
    }))
  );
  const byContract = computeDistribution(
    items.map((i) => {
      const contract = i.request_id ? (contractByRequest.get(i.request_id) ?? null) : null;
      return { ...costOf(i), groupKey: contract, groupLabel: contractTypeLabel(contract) };
    })
  );
  const byQuarter = computeDistribution(
    items.map((i) => ({
      ...costOf(i),
      groupKey: i.target_quarter === null ? null : String(i.target_quarter),
      groupLabel: quarterLabel(i.target_quarter),
    }))
  );

  // Reference data for the add-item form, read through the caller's own
  // client — the same "seeing an option here doesn't guarantee the insert
  // succeeds" caveat as every other create screen in this app.
  const [{ data: orgUnits }, { data: jobTitles }] = canPrepare
    ? await Promise.all([
        supabase.from("org_units").select("id, name_ar").order("name_ar"),
        supabase
          .from("job_titles")
          .select("id, name_ar, grade_level")
          .is("deleted_at", null)
          .order("grade_level", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ marginBottom: 10 }}>
        <BackLink href="/recruitment/plan">{t("backToPlans")}</BackLink>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {plan.name_ar}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("planMeta", {
              year: plan.plan_year,
              status: planStatusLabelFor(plan.status, { financeReviewed: plan.finance_reviewed_at !== null }),
            })}
          </p>
        </div>
        {/* Every button here is `sru-btn-sm` — three quarters of the normal
            size, asked for once the row had grown to seven buttons. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canReviewBudget && (
            <Link href={`/recruitment/plan/${plan.id}/finance`} className="sru-btn sru-btn-primary sru-btn-sm">
              {t("financeReviewScreen")}
            </Link>
          )}
          {canConsolidate && plan.status === "draft" && (
            <Link href={`/recruitment/plan/${plan.id}/consolidate`} className="sru-btn sru-btn-primary sru-btn-sm">
              {t("consolidateRequests")}
            </Link>
          )}
          {/* Excel, CSV and PDF folded into one menu; the separate
              "عرض للطباعة" button is gone, its destination now the menu's PDF
              entry, so nothing was lost with it. */}
          <RecruitmentPlanExportMenu planId={plan.id} />
          <Link href={`/recruitment/plan/${plan.id}/compare`} className="sru-btn sru-btn-primary sru-btn-sm">
            {t("compareTab")}
          </Link>
          <Link href={`/recruitment/plan/${plan.id}/audit`} className="sru-btn sru-btn-primary sru-btn-sm">
            {t("auditTab")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/plan" />

      <div className="sru-card" style={{ marginTop: 20 }}>
        <PlanProgressBar status={plan.status} financeReviewed={plan.finance_reviewed_at !== null} />
        <div style={{ marginTop: 14 }}>
          <PlanWorkflowActions planId={plan.id} status={plan.status} permissions={permissions} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <RecruitmentPlanWindowsCard
          planId={plan.id}
          today={today}
          locale={locale}
          canEdit={canEditWindows}
          initial={{
            requestsOpenAt: plan.requests_open_at,
            requestsCloseAt: plan.requests_close_at,
            planStartDate: plan.plan_start_date,
            planEndDate: plan.plan_end_date,
          }}
        />
      </div>

      <div className="sru-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("totalHeadcount")}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{formatNumber(totals.totalHeadcount)}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("totalMonthlyCost")}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{formatNumber(totals.totalMonthlyCost)}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("totalAnnualCost")}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{formatNumber(totals.totalAnnualCost)}</div>
          </div>
        </div>
        {totals.itemsWithoutCost > 0 && (
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 10 }}>
            {t("itemsWithoutCostNote", { count: totals.itemsWithoutCost })}
          </p>
        )}

        {/* Budget consumption — green under, red over, and an honest "no
            budget set yet" rather than a fabricated 0% when finance has not
            recorded one. */}
        <div style={{ marginTop: 14, borderTop: "1px solid var(--sru-border)", paddingTop: 12 }}>
          {budget.status === "no_budget" ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("noApprovedBudget")}</p>
          ) : (
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("approvedBudget")}</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {formatNumber(budget.approvedBudget ?? 0)}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("budgetVariance")}</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: budget.status === "over" ? "#b91c1c" : "#15803d",
                  }}
                >
                  {formatNumber(budget.variance ?? 0)}
                </div>
              </div>
              {budget.consumedPercentage !== null && (
                <div>
                  <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("budgetConsumed")}</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: budget.status === "over" ? "#b91c1c" : "#15803d",
                    }}
                  >
                    {formatNumber(Math.round(budget.consumedPercentage))}%
                  </div>
                </div>
              )}
            </div>
          )}
          {plan.finance_note && (
            <p style={{ fontSize: 11.5, marginTop: 10 }}>
              <span style={{ color: "var(--sru-muted)" }}>{t("financeNoteLabel")} </span>
              {plan.finance_note}
            </p>
          )}
          {plan.hr_recommendation && (
            <p style={{ fontSize: 11.5, marginTop: 6 }}>
              <span style={{ color: "var(--sru-muted)" }}>{t("hrRecommendationLabel")} </span>
              {plan.hr_recommendation}
            </p>
          )}
        </div>
      </div>

      {/* التوزيعات: by org unit, by contract type, by quarter. */}
      {items.length > 0 && (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {[
            { heading: t("byOrgUnit"), rows: byOrgUnit },
            { heading: t("byContractType"), rows: byContract },
            { heading: t("byQuarter"), rows: byQuarter },
          ].map((group) => (
            <PlanDistributionCard
              key={group.heading}
              heading={group.heading}
              rows={group.rows}
              locale={locale}
            />
          ))}
        </div>
      )}

      <div className="sru-card" style={{ marginTop: 16 }}>
        {items.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noItems")}</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnHeadcount")}</th>
                  <th>{t("columnQuarter")}</th>
                  <th>{t("columnPriority")}</th>
                  <th>{t("columnMonthlyCost")}</th>
                  <th>{t("columnItemStatus")}</th>
                  {canPrepare && <th>{t("columnActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <RecruitmentPlanItemRow
                    key={item.id}
                    canPrepare={canPrepare}
                    locale={locale}
                    item={{
                      id: item.id,
                      jobTitleName: item.job_titles?.name_ar ?? null,
                      gradeLevel: item.job_titles?.grade_level ?? null,
                      positionName: item.org_structure_positions?.name_ar ?? null,
                      orgUnitName: item.org_units?.name_ar ?? null,
                      headcount: item.headcount,
                      targetQuarter: item.target_quarter,
                      priority: item.priority,
                      estimatedMonthlyCost: item.estimated_monthly_cost,
                      justification: item.justification,
                      status: item.status,
                      hasVacancy: item.vacancy_id !== null,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Below the plan's own items, not above them — asked for directly.
          The two ways of adding an item belong after what they add to: the
          reader comes here to see the plan, and a row of actions ahead of it
          pushed the table itself down the page.

          Both are primary: each adds items to the plan, and one filled next
          to one outlined would rank them when they are peers. */}
      {canPrepare && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <RecruitmentPlanHeaderActions planId={plan.id} canPrepare={canPrepare} />
          <AddRecruitmentPlanItemForm
            planId={plan.id}
            orgUnits={orgUnits ?? []}
            jobTitles={jobTitles ?? []}
          />
        </div>
      )}
    </div>
  );
}
