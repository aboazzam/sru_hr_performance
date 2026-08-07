import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { CreateRecruitmentRequestForm } from "@/components/CreateRecruitmentRequestForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// The org units offered here are only the ones the caller can READ. That is
// not the same as the ones they may WRITE to: `recruitment_requests_insert`
// re-checks `check_vpra('recruitmentPlan','prepare', org_unit_id)` per row,
// so a unit visible in this dropdown can still be refused on submit. Same
// caveat every create screen in this app carries, and the honest one — the
// alternative would be reimplementing the org-scope walk in application code.
export default async function NewRecruitmentRequestPage() {
  const t = await getTranslations("RecruitmentRequestsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "recruitmentPlan"
    )?.vpra_level ?? "none";
  const canRaise = hasVpraAccess(level, "prepare");

  const [{ data: orgUnits }, { data: jobTitles }, { data: competencies }] = canRaise
    ? await Promise.all([
        supabase.from("org_units").select("id, name_ar").order("name_ar"),
        supabase.from("job_titles").select("id, name_ar, grade_level").order("name_ar"),
        supabase.from("competencies").select("id, name_ar, type").order("name_ar"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("newRequestHeading")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("newRequestSubtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <Link href="/recruitment/requests" className="sru-btn">
        {t("backToRequests")}
      </Link>

      <div style={{ marginTop: 20 }}>
        {!canRaise ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("forbiddenRaise")}</p>
        ) : (orgUnits ?? []).length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noOrgUnits")}</p>
        ) : (
          <CreateRecruitmentRequestForm
            orgUnits={orgUnits ?? []}
            jobTitles={jobTitles ?? []}
            competencies={competencies ?? []}
          />
        )}
      </div>
    </div>
  );
}
