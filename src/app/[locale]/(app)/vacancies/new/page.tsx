import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateVacancyForm } from "@/components/CreateVacancyForm";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// vacancies_insert's own RLS requires check_vpra('vacancies','approve',
// org_unit_id) — hr_admin-only per the seeded matrix, even though
// `vacancies` itself is intentionally view-able by all staff. This form was
// previously reachable and fully renderable by any authenticated user (same
// bug class found in the audit that fixed kpis/strategic-goals). Gated here
// at the flat `vacancies>=approve` bar as a page-level pre-check; the real
// per-org-unit boundary stays vacancies_insert's own RLS.
export default async function CreateVacancyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("CreateVacancyPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const vacanciesLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "vacancies"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(vacanciesLevel, "approve");

  if (!canCreate) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // RLS-scoped to the caller, same "seeing an option here doesn't
  // guarantee the insert succeeds" caveat as every other create screen —
  // the real authorization boundary is vacancies_insert's own RLS.
  const { data: jobTitles } = await supabase
    .from("job_titles")
    // qualification_required is the FALLBACK requirements source, used only
    // when the career path records no transition into this title (see below).
    .select("id, name_ar, grade_level, qualification_required")
    .is("deleted_at", null)
    .order("grade_level");

  const { data: orgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .order("name_ar");

  // The vacancy's requirements are prefilled from the career path's own
  // "متطلبات الانتقال" — the requirements recorded on every edge leading INTO
  // the selected job title (2026-08-04, the project owner's own choice over
  // job_titles.qualification_required, which is now the explicit fallback for
  // the ~211 titles the career path records no transition into). The from-side
  // title's name is resolved
  // from `jobTitles` above rather than a PostgREST embed: career_path has two
  // FKs to job_titles, which needs explicit disambiguation hints, and every
  // job title is already loaded here for the select anyway.
  const { data: careerPathEdges } = await supabase
    .from("career_path")
    .select("from_job_title_id, to_job_title_id, requirements_ar")
    .is("deleted_at", null)
    .not("requirements_ar", "is", null);

  const jobTitleNames = new Map((jobTitles ?? []).map((title) => [title.id, title.name_ar]));
  const transitionRequirements: Record<string, { fromName: string; text: string }[]> = {};
  for (const edge of careerPathEdges ?? []) {
    const text = edge.requirements_ar?.trim();
    if (!text) continue;
    (transitionRequirements[edge.to_job_title_id] ??= []).push({
      fromName: jobTitleNames.get(edge.from_job_title_id) ?? "",
      text,
    });
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {jobTitles && jobTitles.length > 0 && orgUnits && orgUnits.length > 0 ? (
        <CreateVacancyForm
          locale={locale}
          jobTitles={jobTitles}
          orgUnits={orgUnits}
          transitionRequirements={transitionRequirements}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
