import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/BackLink";
import { isRaisedOutOfPlan } from "@/lib/recruitmentPlanWindows";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { todayInTimezone } from "@/lib/evaluationCycle";
import { CreateRecruitmentRequestForm } from "@/components/CreateRecruitmentRequestForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { type BehavioralLevel } from "@/lib/data/competencies";

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
      (row) => row.process_area === "recruitmentRequests"
    )?.vpra_level ?? "none";
  const canRaise = hasVpraAccess(level, "prepare");

  const [{ data: orgUnits }, { data: jobTitles }, { data: competencies }] = canRaise
    ? await Promise.all([
        supabase.rpc("my_org_units_with_access", {
          p_process_area: "recruitmentRequests",
          p_min_level: "prepare",
        }),
        // `qualification_required` and the title's own competency links feed
        // the form's prefill: picking a job title fills the qualifications box
        // and ticks that title's competencies, both left editable.
        supabase
          .from("job_titles")
          .select("id, name_ar, grade_level, qualification_required")
          .order("name_ar"),
        supabase.from("competencies").select("id, name_ar, type").order("name_ar"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  // job_title_competencies is read separately rather than as an embed: this is
  // a plain lookup table with no ambiguity, and fetching it flat avoids the
  // array-vs-object embed inference trap this project has hit before.
  //
  // `required_level` is carried too, not just the id: the catalogue already
  // records how well each competency must be held for that title (it is NOT
  // NULL there), so picking a title seeds the level as well as the tick, and
  // the requester only has to choose one for competencies they add by hand.
  const { data: titleCompetencyRows } = canRaise
    ? await supabase
        .from("job_title_competencies")
        .select("job_title_id, competency_id, required_level")
        .is("deleted_at", null)
    : { data: null };

  const competenciesByJobTitle: Record<string, { competencyId: string; requiredLevel: BehavioralLevel }[]> = {};
  for (const row of titleCompetencyRows ?? []) {
    (competenciesByJobTitle[row.job_title_id] ??= []).push({
      competencyId: row.competency_id,
      requiredLevel: row.required_level as BehavioralLevel,
    });
  }

  // يُقال للمُقدِّم قبل أن يكتب، لا بعد أن يرسل: الطلب المرفوع خارج نافذة
  // الاستقبال يُسجَّل «خارج الخطة»، وهو تصنيفٌ يبقى معه. القراءة بعميل
  // المستخدم نفسه، فما لا يراه من خطط لا يُحتسب له — ومن لا يرى خطةً فطلبه
  // خارجها فعلًا.
  const { data: openPlans } = await supabase
    .from("recruitment_plans")
    .select("id, status, requests_open_at, requests_close_at")
    .is("deleted_at", null);
  const outOfPlanNow = isRaisedOutOfPlan(
    openPlans ?? [],
    todayInTimezone(await getDisplayTimezone(supabase))
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ marginBottom: 10 }}>
        <BackLink href="/recruitment/requests">{t("backToRequests")}</BackLink>
      </div>

      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("newRequestHeading")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("newRequestSubtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      {canRaise && (
        <p
          className="pill"
          style={{ display: "inline-block", marginTop: 4 }}
        >
          {t(outOfPlanNow ? "intakeClosedNotice" : "intakeOpenNotice")}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        {!canRaise ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("forbiddenRaise")}</p>
        ) : (orgUnits ?? []).length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noOrgUnits")}</p>
        ) : (
          <CreateRecruitmentRequestForm
            orgUnits={orgUnits ?? []}
            jobTitles={jobTitles ?? []}
            competencies={competencies ?? []}
            competenciesByJobTitle={competenciesByJobTitle}
          />
        )}
      </div>
    </div>
  );
}
