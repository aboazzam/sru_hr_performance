import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { CreateRecruitmentPlanForm } from "@/components/CreateRecruitmentPlanForm";
import { RecruitmentPlanRow } from "@/components/RecruitmentPlanRow";
import { intakeWindowState } from "@/lib/recruitmentPlanWindows";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { sortPlansForList } from "@/lib/recruitmentPlanList";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
//
// The plan list. `recruitment_plans_select` (20260804000002) is the real
// read gate (`recruitmentPlan>=view`, seeded hr_admin/super_admin), so a
// caller without it simply gets zero rows — the explicit `canView` check
// below only exists to show an honest message instead of an empty list that
// looks like "no plans exist yet".
export default async function RecruitmentPlanPage() {
  const t = await getTranslations("RecruitmentPlanPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "recruitmentPlan"
    )?.vpra_level ?? "none";
  // اليوم بتوقيت العرض المضبوط في النظام لا بتوقيت الخادم ولا المتصفح:
  // حالة النافذة تُقاس بيوم المنظمة، وحسابها في العميل يجعلها تختلف بين
  // رسم الخادم ورسمه.
  const today = todayInTimezone(await getDisplayTimezone(supabase));
  const canView = hasVpraAccess(level, "view");
  const canPrepare = hasVpraAccess(level, "prepare");

  const { data: planRows } = canView
    ? await supabase
        .from("recruitment_plans")
        .select("id, name_ar, plan_year, status, notes, finance_reviewed_at, requests_open_at, requests_close_at")
        .is("deleted_at", null)
        .order("plan_year", { ascending: false })
    : { data: null };

  // Ordered in JS rather than by the query: "open first" is a rule about what
  // a status MEANS, and it belongs with the other workflow rules where it can
  // be unit-tested — not spelt out as an ORDER BY clause nothing tests. The
  // year ordering above still stands as the tie-break the sort then refines.
  const plans = sortPlansForList(planRows ?? []);

  // Per-plan headcount, computed from the items the caller can actually read
  // (same RLS), so the list column can never claim more than the detail page
  // will show.
  const { data: itemRows } = canView
    ? await supabase.from("recruitment_plan_items").select("plan_id, headcount").is("deleted_at", null)
    : { data: null };
  const headcountByPlan = new Map<string, number>();
  for (const row of itemRows ?? []) {
    headcountByPlan.set(row.plan_id, (headcountByPlan.get(row.plan_id) ?? 0) + row.headcount);
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/plan" />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 24 }}>{t("forbidden")}</p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* The action row sits above the list. In RTL the first child lands
              at the top RIGHT, which is where the button was asked for — no
              float or explicit alignment needed. */}
          {canPrepare && (
            /* `sru-actionbar` — نفس شريط أزرار المبادرات وبقية شاشات
               التوظيف. كان هذا الزر وحده باقيًا على الحجم الكبير، فيقرأ
               مختلفًا عن أزرار الشاشات المجاورة بلا سبب. */
            <div className="sru-actionbar no-print">
              <CreateRecruitmentPlanForm />
            </div>
          )}

          {plans.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
          ) : (
            <div className="sru-card">
              <div className="table-scroll">
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("columnPlan")}</th>
                      <th>{t("columnYear")}</th>
                      <th>{t("columnStatus")}</th>
                      <th>{t("columnHeadcount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* No "open plan" column any more — the row itself opens
                        it, so the trailing button and its empty header are
                        gone rather than left as a dead cell. */}
                    {plans.map((plan) => (
                      <RecruitmentPlanRow
                        key={plan.id}
                        planId={plan.id}
                        nameAr={plan.name_ar}
                        notes={plan.notes}
                        planYear={plan.plan_year}
                        status={plan.status}
                        intakeState={intakeWindowState(plan.requests_open_at, plan.requests_close_at, today)}
                        financeReviewed={plan.finance_reviewed_at !== null}
                        headcount={headcountByPlan.get(plan.id) ?? 0}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
