import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { CreateRecruitmentPlanForm } from "@/components/CreateRecruitmentPlanForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { planStatusLabel } from "@/lib/recruitmentWorkflow";

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
  const canView = hasVpraAccess(level, "view");
  const canPrepare = hasVpraAccess(level, "prepare");

  const { data: plans } = canView
    ? await supabase
        .from("recruitment_plans")
        .select("id, name_ar, plan_year, status, notes")
        .is("deleted_at", null)
        .order("plan_year", { ascending: false })
    : { data: null };

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
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/plan" />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 24 }}>{t("forbidden")}</p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {canPrepare && <CreateRecruitmentPlanForm defaultYear={new Date().getFullYear()} />}

          {!plans || plans.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
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
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id}>
                        <td>
                          {plan.name_ar}
                          {plan.notes && (
                            <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{plan.notes}</div>
                          )}
                        </td>
                        <td className="sru-en">{plan.plan_year}</td>
                        <td>
                          <span className="pill">{planStatusLabel(plan.status)}</span>
                        </td>
                        <td className="sru-en">{headcountByPlan.get(plan.id) ?? 0}</td>
                        <td>
                          <Link href={`/recruitment/plan/${plan.id}`} className="sru-btn">
                            {t("openPlan")}
                          </Link>
                        </td>
                      </tr>
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
