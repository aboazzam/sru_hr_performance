import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { BehavioralLevel } from "@/lib/data/competencies";
import { JobTitleDescriptionForm } from "@/components/JobTitleDescriptionForm";
import { JobTitleCompetenciesManager } from "@/components/JobTitleCompetenciesManager";
import { JobTitleCoreForm } from "@/components/JobTitleCoreForm";
import { CareerPathEdgesManager } from "@/components/CareerPathEdgesManager";
import { ApproveCareerContentButton } from "@/components/ApproveCareerContentButton";

// Auth is enforced centrally by (app)/layout.tsx.
//
// This whole page is part of the management screen and requires
// careerPath>=prepare, not just its writes — found live (2026-07-26)
// alongside the /career-path-list issue that a view-level employee could
// browse into any job title's full detail (description + every required
// competency) here, even though writes were already correctly blocked.
// Real authorization for the writes below remains job_titles_update /
// job_title_competencies_insert|update's own RLS
// (check_vpra_global('careerPath','prepare')); this page-level gate
// additionally restricts the READ side of the whole screen to the same
// bar, skipping every query below entirely rather than just hiding
// controls, same discipline as /admin/org-structure's view-vs-prepare split.
//
// 2026-07-27: extended with a "approve" tier (careerPath>=approve) for the
// career_content_status workflow, core-field editing, and career_path edge
// management — see /career-path/job-titles/actions.ts.
export default async function CareerPathJobTitleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("CareerPathJobTitleDetailPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const careerPathLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "careerPath"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(careerPathLevel, "prepare");
  const canApprove = hasVpraAccess(careerPathLevel, "approve");

  if (!canEdit) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noPermission")}</p>
      </div>
    );
  }

  const { data: jobTitle } = await supabase
    .from("job_titles")
    .select(
      "id, name_ar, name_en, grade_level, category, qualification_required, description_ar, career_content_status, job_family_id, job_families(name_ar)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const jt = jobTitle as unknown as {
    id: string;
    name_ar: string;
    name_en: string | null;
    grade_level: number;
    category: string;
    qualification_required: string | null;
    description_ar: string | null;
    career_content_status: "draft" | "approved";
    job_family_id: string;
    job_families: { name_ar: string } | null;
  } | null;

  if (!jt) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  // Two flat queries + a JS join, rather than a 2-level PostgREST embed
  // (competencies -> competency_domains -> competency_pillars) — keeps the
  // pillar grouping (both for the picker AND, since 2026-08-02, the assigned
  // list itself) without adding an unverified multi-level embed shape,
  // matching this app's habit of assembling small lookups in code.
  const { data: domainsData } = await supabase.from("competency_domains").select("id, competency_pillars(name_ar)");
  const domainPillar = new Map(
    ((domainsData as unknown as Array<{ id: string; competency_pillars: { name_ar: string } | null }>) ?? []).map(
      (d) => [d.id, d.competency_pillars?.name_ar ?? "—"]
    )
  );

  const { data: allCompetenciesData } = await supabase
    .from("competencies")
    .select("id, name_ar, domain_id, type")
    .is("deleted_at", null)
    .order("name_ar");
  const allCompetenciesRows =
    (allCompetenciesData as unknown as Array<{ id: string; name_ar: string; domain_id: string; type: string }> | null) ?? [];

  const allCompetencies = allCompetenciesRows.map((c) => ({ id: c.id, nameAr: c.name_ar, pillarAr: domainPillar.get(c.domain_id) ?? "—" }));
  // "الجدارات الأساسية تظهر بشكل تلقائي" (2026-08-03): every type='core'
  // competency is always listed on the detail page regardless of whether
  // it's been assigned to this job title yet, same source as the new-job-title
  // creation flow's own coreCompetencies (StagedCompetenciesPicker).
  const coreCompetencies = allCompetenciesRows
    .filter((c) => c.type === "core")
    .map((c) => ({ id: c.id, nameAr: c.name_ar, pillarAr: domainPillar.get(c.domain_id) ?? "—" }));

  // "ضع الجدارات حسب التصنيف" (2026-08-02): the assigned list used to render
  // flat, with no pillar grouping at all, even though the ADD dropdown right
  // below it already grouped its own options by pillar via optgroups --
  // extending the query to also carry domain_id lets the assigned list use
  // the same domainPillar lookup for a consistent grouping on both sides.
  const { data: assignedData } = await supabase
    .from("job_title_competencies")
    .select("id, competency_id, required_level, competencies(name_ar, domain_id)")
    .eq("job_title_id", id)
    .is("deleted_at", null);

  const assigned = (
    (assignedData as unknown as Array<{
      id: string;
      competency_id: string;
      required_level: BehavioralLevel;
      competencies: { name_ar: string; domain_id: string } | null;
    }> | null) ?? []
  )
    .filter((row) => row.competencies)
    .map((row) => ({
      id: row.id,
      competencyId: row.competency_id,
      nameAr: row.competencies!.name_ar,
      pillarAr: domainPillar.get(row.competencies!.domain_id) ?? "—",
      requiredLevel: row.required_level,
    }));

  const { data: jobFamiliesData } = await supabase.from("job_families").select("id, name_ar").order("name_ar");
  const jobFamilies = ((jobFamiliesData as unknown as Array<{ id: string; name_ar: string }>) ?? []).map((f) => ({
    id: f.id,
    nameAr: f.name_ar,
  }));

  // Two FKs to job_titles from career_path require explicit relationship
  // hints, same as the existing /career-path list page.
  const { data: edgesData } = await supabase
    .from("career_path")
    .select(
      "id, requirements_ar, from_job_title_id, to_job_title_id, from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
    )
    .or(`from_job_title_id.eq.${id},to_job_title_id.eq.${id}`)
    .is("deleted_at", null);

  const edges = (
    (edgesData as unknown as Array<{
      id: string;
      requirements_ar: string | null;
      from_job_title_id: string;
      to_job_title_id: string;
      from_job_title: { name_ar: string; grade_level: number } | null;
      to_job_title: { name_ar: string; grade_level: number } | null;
    }> | null) ?? []
  ).map((e) => {
    const isFrom = e.from_job_title_id === id;
    const other = isFrom ? e.to_job_title : e.from_job_title;
    return {
      id: e.id,
      otherJobTitleId: isFrom ? e.to_job_title_id : e.from_job_title_id,
      otherNameAr: other?.name_ar ?? "—",
      otherGradeLevel: other?.grade_level ?? 0,
      requirementsAr: e.requirements_ar,
      isFrom,
    };
  });

  const { data: allJobTitlesData } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level")
    .is("deleted_at", null)
    .order("grade_level", { ascending: false })
    .order("name_ar");
  const allJobTitles = ((allJobTitlesData as unknown as Array<{ id: string; name_ar: string; grade_level: number }>) ?? []).map(
    (j) => ({ id: j.id, nameAr: j.name_ar, gradeLevel: j.grade_level })
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {jt.name_ar}
            <span className="sru-chip sru-en" style={{ marginInlineStart: 10 }}>
              {t("gradeLabel", { grade: jt.grade_level })}
            </span>
            <span
              className="sru-chip"
              style={{
                marginInlineStart: 10,
                background: jt.career_content_status === "approved" ? "var(--sru-green-bg, #e6f4ea)" : undefined,
              }}
            >
              {jt.career_content_status === "approved" ? t("statusApproved") : t("statusDraft")}
            </span>
          </h1>
          {jt.name_en && <p className="sru-name-en is-lg">{jt.name_en}</p>}
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {jt.job_families?.name_ar ?? "—"}
            {jt.qualification_required ? ` · ${jt.qualification_required.replace(/\n/g, "، ")}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canApprove && jt.career_content_status === "draft" && <ApproveCareerContentButton jobTitleId={jt.id} />}
          <Link href="/career-path/job-titles" className="sru-btn">
            {t("backToList")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <JobTitleCoreForm
        jobTitleId={jt.id}
        initial={{
          nameAr: jt.name_ar,
          nameEn: jt.name_en,
          jobFamilyId: jt.job_family_id,
          gradeLevel: jt.grade_level,
          category: jt.category,
          qualificationRequired: jt.qualification_required,
        }}
        jobFamilies={jobFamilies}
        canEdit={canEdit}
      />

      <JobTitleDescriptionForm
        jobTitleId={jt.id}
        descriptionAr={jt.description_ar}
        canEdit={canEdit}
        nameAr={jt.name_ar}
        familyNameAr={jt.job_families?.name_ar ?? ""}
        gradeLevel={jt.grade_level}
        category={jt.category}
        qualificationRequired={jt.qualification_required}
      />

      <JobTitleCompetenciesManager
        jobTitleId={jt.id}
        assigned={assigned}
        coreCompetencies={coreCompetencies}
        allCompetencies={allCompetencies}
        canEdit={canEdit}
      />

      <CareerPathEdgesManager jobTitleId={jt.id} edges={edges} allJobTitles={allJobTitles} canEdit={canEdit} />
    </div>
  );
}
