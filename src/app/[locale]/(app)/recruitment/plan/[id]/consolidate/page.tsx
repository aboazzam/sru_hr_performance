import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ConsolidateRequestsPanel } from "@/components/ConsolidateRequestsPanel";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { RecruitmentPermissions } from "@/lib/recruitmentWorkflow";

// شاشة دمج الموارد البشرية: the unmerged requests, priced, then folded into
// one plan. Gated at `recruitmentPlan>=recommend` — VPRA's own "submit /
// recommend upward" level, which is what separates HR from a section head
// holding 'prepare'. The writes themselves are re-checked server-side by the
// transition guard and by RLS; this gate only decides whether to render.
export default async function ConsolidatePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("RecruitmentConsolidatePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  const canConsolidate = hasVpraAccess(permissions.recruitmentPlan ?? "none", "recommend");

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, name_ar, plan_year, status, hr_recommendation")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  // Candidates: requests HR has already reviewed and that are not yet on any
  // plan. Anything still `under_hr_review` is deliberately absent — merging
  // it would budget for a request nobody has checked, and HR's own next act
  // there is the review itself, on the requests screen.
  //
  // An `approved` request normally lands on a plan automatically the moment
  // the approver rules on it (20260808000003); it stays listed here for the
  // case where no draft plan existed at that moment, so it is never stranded.
  const { data: requests } = canConsolidate
    ? await supabase
        .from("recruitment_requests")
        .select(
          "id, status, org_unit_id, job_title_id, custom_job_title, headcount, request_reason, proposed_quarter, estimated_cost_by_requester, estimated_cost_by_hr"
        )
        .is("plan_id", null)
        .is("deleted_at", null)
        .in("status", ["hr_reviewed", "approved"])
        .order("created_at", { ascending: true })
    : { data: null };

  const orgUnitIds = [...new Set((requests ?? []).map((r) => r.org_unit_id))];
  const jobTitleIds = [...new Set((requests ?? []).map((r) => r.job_title_id).filter(Boolean))];

  const { data: orgUnits } = orgUnitIds.length
    ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds)
    : { data: [] };
  const { data: jobTitles } = jobTitleIds.length
    ? await supabase.from("job_titles").select("id, name_ar").in("id", jobTitleIds as string[])
    : { data: [] };

  const orgUnitName = Object.fromEntries((orgUnits ?? []).map((u) => [u.id, u.name_ar]));
  const jobTitleName = Object.fromEntries((jobTitles ?? []).map((j) => [j.id, j.name_ar]));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      {plan && (
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
          {plan.name_ar} — {plan.plan_year}
        </p>
      )}
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <Link href={`/recruitment/plan/${id}`} className="sru-btn">
        {t("backToPlan")}
      </Link>

      <div style={{ marginTop: 20 }}>
        {!canConsolidate ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("forbidden")}</p>
        ) : !plan ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("planNotFound")}</p>
        ) : plan.status !== "draft" ? (
          // Merging into a plan that already left HR's hands would change
          // what finance reviewed or what the authority approved.
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("planNotEditable")}</p>
        ) : (
          <ConsolidateRequestsPanel
            planId={id}
            requests={requests ?? []}
            orgUnitName={orgUnitName}
            jobTitleName={jobTitleName}
            permissions={permissions}
            initialRecommendation={plan.hr_recommendation ?? ""}
          />
        )}
      </div>
    </div>
  );
}
