import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ImportVacanciesExcelForm } from "@/components/ImportVacanciesExcelForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { VacanciesTable, type VacancyRowView } from "@/components/VacanciesTable";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function VacanciesPage() {
  const t = await getTranslations("VacanciesPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (vacancies_select: check_vpra('vacancies',
  // 'view', org_unit_id)) — unlike promotions/rewards/calibration,
  // `employee` holds a real 'view' grant on `vacancies` in the seeded
  // matrix (internal job postings are meant to be visible to all staff),
  // so this list is not restricted to oversight roles. job_titles/
  // org_units are each a single, unambiguous FK here (unlike promotions/
  // rewards' dual FKs to profiles) — verified this exact shape against
  // the REST API with a real temporary row before writing this query.
  const { data } = await supabase
    .from("vacancies")
    .select("id, status, requirements_ar, announced_at, posting_scope, created_at, job_titles(name_ar,grade_level), org_units(name_ar)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const vacancies = data as unknown as Array<{
    id: string;
    status: string;
    requirements_ar: string | null;
    announced_at: string | null;
    created_at: string;
    posting_scope: string;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  }> | null;

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const vacanciesLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "vacancies"
    )?.vpra_level ?? "none";
  // Mirrors `vacancies_update`'s own RLS bar (recommend — hr_admin/manager).
  // Hiding the controls is presentation only; Postgres is still the gate.
  const canManage = hasVpraAccess(vacanciesLevel, "recommend");
  const canCreate = hasVpraAccess(vacanciesLevel, "approve");

  // Which postings came from a recruitment plan. Read through the caller's
  // own client, so a user without `recruitmentPlan>=view` simply sees no
  // provenance line rather than an error — the link is context, not data
  // this page depends on.
  const { data: planLinks } = await supabase
    .from("recruitment_plan_items")
    .select("vacancy_id, recruitment_plans(plan_year)")
    .not("vacancy_id", "is", null)
    .is("deleted_at", null);

  const planYearByVacancy = new Map<string, number>();
  for (const link of (planLinks ?? []) as unknown as Array<{
    vacancy_id: string;
    recruitment_plans: { plan_year: number } | null;
  }>) {
    if (link.recruitment_plans) planYearByVacancy.set(link.vacancy_id, link.recruitment_plans.plan_year);
  }

  const rows: VacancyRowView[] = (vacancies ?? []).map((vacancy) => ({
    id: vacancy.id,
    jobTitleName: vacancy.job_titles?.name_ar ?? null,
    gradeLevel: vacancy.job_titles?.grade_level ?? null,
    orgUnitName: vacancy.org_units?.name_ar ?? null,
    status: vacancy.status,
    requirementsAr: vacancy.requirements_ar,
    planYear: planYearByVacancy.get(vacancy.id) ?? null,
    announced: vacancy.announced_at !== null,
    createdAt: vacancy.created_at,
    postingScope: vacancy.posting_scope,
  }));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        {/* Import buttons live in the always-visible header, NOT behind the
            empty-list check — bootstrapping data when no vacancy exists yet is
            the main reason to use them (same placement decision as the
            career-path page's own import). Both import and create write to
            `vacancies`, which needs `approve`, so they're hidden below that
            bar rather than offered and then rejected by Postgres. */}
        {canCreate && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ImportVacanciesExcelForm />
            <Link href="/vacancies/new" className="sru-btn sru-btn-primary">
              {t("newVacancy")}
            </Link>
          </div>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      {/* Member of the "التوظيف" group (2026-08-04) — its tab bar, same
          pattern as every other grouped page. */}
      <GroupTabs groupKey="recruitment" current="vacancies" />
      <div style={{ height: 20 }} />

      <VacanciesTable vacancies={rows} canManage={canManage} />
    </div>
  );
}
