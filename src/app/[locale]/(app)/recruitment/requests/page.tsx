import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { RecruitmentRequestsTable } from "@/components/RecruitmentRequestsTable";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { type RecruitmentPermissions } from "@/lib/recruitmentWorkflow";

// Auth is enforced centrally by (app)/layout.tsx.
//
// WHICH REQUESTS A CALLER SEES IS NOT DECIDED HERE. `recruitment_requests`'
// RLS (20260807000002) is the real gate, and it is ORG-SCOPED: a section
// head granted `recruitmentPlan` with scope_type='org_unit' gets only their
// own subtree, an hr_admin with scope 'all' gets everything, and a finance
// reviewer gets everything via `recruitmentBudget>=view`. This page issues
// one unfiltered query and lets Postgres decide — adding an application-side
// filter here would either duplicate that logic or contradict it.

// The inline editor spans the whole table; keep it in step with the <thead>
// in RecruitmentRequestsTable, which owns the markup now.
// The reason/contract/gender label maps moved into RecruitmentRequestRow with
// the cells that render them, and now read from the message catalogue like the
// rest of that component.
const TABLE_COLUMN_COUNT = 10;

export default async function RecruitmentRequestsPage() {
  const t = await getTranslations("RecruitmentRequestsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  // طلب الاحتياج له مجاله الخاص منذ 20260807000009، بعد أن كان مطويًا داخل
  // `recruitmentPlan` — فصار يمكن منح منسّق صلاحية رفع الطلبات دون أن يرى
  // الخطة نفسها.
  const planLevel = permissions.recruitmentRequests ?? "none";
  const budgetLevel = permissions.recruitmentBudget ?? "none";
  const canView = hasVpraAccess(planLevel, "view") || hasVpraAccess(budgetLevel, "view");
  const canRaise = hasVpraAccess(planLevel, "prepare");

  const { data: requests } = canView
    ? await supabase
        .from("recruitment_requests")
        .select(
          // `qualifications` is not shown as a column, but the inline editor
          // sends every field `updateRecruitmentRequest` takes — it has to
          // arrive here so saving an edit cannot blank it out.
          "id, status, org_unit_id, job_title_id, custom_job_title, headcount, request_reason, contract_type, gender, proposed_quarter, qualifications, estimated_cost_by_requester, estimated_cost_by_hr, plan_id, created_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  // Reference tables fetched separately and joined in JS rather than via
  // PostgREST embeds — the same approach used on /promotions/history, and it
  // sidesteps the array-vs-object embed inference bug this project has hit.
  const orgUnitIds = [...new Set((requests ?? []).map((r) => r.org_unit_id))];
  const jobTitleIds = [...new Set((requests ?? []).map((r) => r.job_title_id).filter(Boolean))];

  const { data: orgUnits } = orgUnitIds.length
    ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds)
    : { data: [] };
  const { data: jobTitles } = jobTitleIds.length
    ? await supabase.from("job_titles").select("id, name_ar").in("id", jobTitleIds as string[])
    : { data: [] };

  // Printed-on stamp: formatted here rather than in the client component,
  // so the server and client renders cannot disagree and the date follows the
  // configured display timezone like every other date in this app.
  const displayTimezone = await getDisplayTimezone(supabase);
  const printedOn = new Intl.DateTimeFormat("ar", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: displayTimezone,
  }).format(new Date());

  const orgUnitName = new Map((orgUnits ?? []).map((u) => [u.id, u.name_ar]));
  const jobTitleName = new Map((jobTitles ?? []).map((j) => [j.id, j.name_ar]));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/requests" />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 24 }}>{t("forbidden")}</p>
      ) : (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          {canRaise && (
            <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/recruitment/requests/new" className="sru-btn sru-btn-primary">
                {t("newRequest")}
              </Link>
            </div>
          )}

          {!requests || requests.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
          ) : (
            <RecruitmentRequestsTable
              rows={requests.map((request) => ({
                request,
                jobTitle: request.job_title_id
                  ? (jobTitleName.get(request.job_title_id) ?? "—")
                  : (request.custom_job_title ?? "—"),
                orgUnit: orgUnitName.get(request.org_unit_id) ?? "—",
                createdAt: request.created_at,
              }))}
              permissions={permissions}
              canEdit={canRaise}
              columnCount={TABLE_COLUMN_COUNT}
              printedOn={printedOn}
            />
          )}
        </div>
      )}
    </div>
  );
}
