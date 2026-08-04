import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { RecruitmentPlanHeaderActions } from "@/components/RecruitmentPlanHeaderActions";
import { AddRecruitmentPlanItemForm } from "@/components/AddRecruitmentPlanItemForm";
import { RecruitmentPlanItemRow } from "@/components/RecruitmentPlanItemRow";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import {
  computeRecruitmentPlanTotals,
  recruitmentPlanStatusLabel,
} from "@/lib/recruitmentPlan";
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
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "recruitmentPlan"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(level, "view");
  const canPrepare = hasVpraAccess(level, "prepare");
  const canApprove = hasVpraAccess(level, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {t("title")}
        </h1>
        <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
        <GroupTabs groupKey="recruitment" current="recruitment/plan" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 24 }}>{t("forbidden")}</p>
      </div>
    );
  }

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, name_ar, plan_year, status, notes, approved_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!plan) notFound();

  const { data: itemData } = await supabase
    .from("recruitment_plan_items")
    .select(
      "id, headcount, target_quarter, priority, estimated_monthly_cost, justification, status, vacancy_id, org_units(name_ar), job_titles(name_ar,grade_level), org_structure_positions(name_ar)"
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
    org_units: { name_ar: string } | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_structure_positions: { name_ar: string } | null;
  }>;

  const totals = computeRecruitmentPlanTotals(
    items.map((i) => ({ headcount: i.headcount, estimatedMonthlyCost: i.estimated_monthly_cost }))
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

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {plan.name_ar}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("planMeta", { year: plan.plan_year, status: recruitmentPlanStatusLabel(plan.status) })}
          </p>
        </div>
        <Link href="/recruitment/plan" className="sru-btn">
          {t("backToPlans")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/plan" />

      <div className="sru-card" style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("totalHeadcount")}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(totals.totalHeadcount)}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("totalMonthlyCost")}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(totals.totalMonthlyCost)}</div>
          </div>
          <div>
            <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("totalAnnualCost")}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatNumber(totals.totalAnnualCost)}</div>
          </div>
        </div>
        {totals.itemsWithoutCost > 0 && (
          <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 10 }}>
            {t("itemsWithoutCostNote", { count: totals.itemsWithoutCost })}
          </p>
        )}
      </div>

      {(canPrepare || canApprove) && (
        <div style={{ marginTop: 16 }}>
          <RecruitmentPlanHeaderActions
            planId={plan.id}
            canPrepare={canPrepare}
            canApprove={canApprove}
            isApproved={plan.status === "approved"}
          />
        </div>
      )}

      {canPrepare && (
        <div style={{ marginTop: 16 }}>
          <AddRecruitmentPlanItemForm
            planId={plan.id}
            orgUnits={orgUnits ?? []}
            jobTitles={jobTitles ?? []}
          />
        </div>
      )}

      <div className="sru-card" style={{ marginTop: 16 }}>
        {items.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noItems")}</p>
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
    </div>
  );
}
