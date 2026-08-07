import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { CreateRecruitmentRequestForm } from "@/components/CreateRecruitmentRequestForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// The org unit list asks the RIGHT question: "where may I WRITE?", not
// "what may I read?".
//
// 2026-08-07, found live: a real coordinator scoped to ONE unit saw all 58 in
// this dropdown. The security boundary held (the insert was refused with
// 42501), but the form was promising a choice the server would then reject.
// The cause was not a bug in either policy — `org_units_select` legitimately
// accepts several areas, and that user separately held the `employee` role at
// `scope_type='all'`, which carries `vacancies=view`, so they could genuinely
// READ every unit while being able to WRITE to only one.
//
// `my_org_units_with_access` (20260807000007) resolves it by asking about the
// write level instead. It is SECURITY INVOKER, so `org_units_select` still
// applies on top — the function can only ever narrow the list, never widen
// it, and cannot surface a unit the caller could not already see.
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
        supabase.rpc("my_org_units_with_access", {
          p_process_area: "recruitmentPlan",
          p_min_level: "prepare",
        }),
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
