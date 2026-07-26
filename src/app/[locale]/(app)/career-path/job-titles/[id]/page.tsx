import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { BehavioralLevel } from "@/lib/data/competencies";
import { JobTitleDescriptionForm } from "@/components/JobTitleDescriptionForm";
import { JobTitleCompetenciesManager } from "@/components/JobTitleCompetenciesManager";

// Auth is enforced centrally by (app)/layout.tsx. Real write authorization
// is job_titles_update / job_title_competencies_insert|update's own RLS
// (check_vpra_global('careerPath','prepare')) — this page only mirrors that
// bar in application code to decide whether to render editable controls or
// a read-only view, same pattern as /admin/identity.
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

  const { data: jobTitle } = await supabase
    .from("job_titles")
    .select("id, name_ar, name_en, grade_level, category, qualification_required, description_ar, job_families(name_ar)")
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
    job_families: { name_ar: string } | null;
  } | null;

  if (!jt) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const { data: assignedData } = await supabase
    .from("job_title_competencies")
    .select("id, competency_id, required_level, competencies(name_ar)")
    .eq("job_title_id", id)
    .is("deleted_at", null);

  const assigned = (
    (assignedData as unknown as Array<{
      id: string;
      competency_id: string;
      required_level: BehavioralLevel;
      competencies: { name_ar: string } | null;
    }> | null) ?? []
  )
    .filter((row) => row.competencies)
    .map((row) => ({
      id: row.id,
      competencyId: row.competency_id,
      nameAr: row.competencies!.name_ar,
      requiredLevel: row.required_level,
    }));

  // Two flat queries + a JS join, rather than a 2-level PostgREST embed
  // (competencies -> competency_domains -> competency_pillars) — keeps the
  // picker's pillar grouping without adding an unverified multi-level embed
  // shape, matching this app's habit of assembling small lookups in code.
  const { data: domainsData } = await supabase.from("competency_domains").select("id, competency_pillars(name_ar)");
  const domainPillar = new Map(
    ((domainsData as unknown as Array<{ id: string; competency_pillars: { name_ar: string } | null }>) ?? []).map(
      (d) => [d.id, d.competency_pillars?.name_ar ?? "—"]
    )
  );

  const { data: allCompetenciesData } = await supabase
    .from("competencies")
    .select("id, name_ar, domain_id")
    .is("deleted_at", null)
    .order("name_ar");

  const allCompetencies = ((allCompetenciesData as unknown as Array<{ id: string; name_ar: string; domain_id: string }>) ?? []).map(
    (c) => ({ id: c.id, nameAr: c.name_ar, pillarAr: domainPillar.get(c.domain_id) ?? "—" })
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
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {jt.job_families?.name_ar ?? "—"}
            {jt.qualification_required ? ` · ${jt.qualification_required.replace(/\n/g, "، ")}` : ""}
          </p>
        </div>
        <Link href="/career-path/job-titles" className="sru-btn">
          {t("backToList")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("descriptionHeading")}</h2>
      <div className="sru-card" style={{ padding: 16, marginBottom: 28 }}>
        <JobTitleDescriptionForm jobTitleId={jt.id} descriptionAr={jt.description_ar} canEdit={canEdit} />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t("competenciesHeading")}</h2>
      <div className="sru-card" style={{ padding: 16 }}>
        <JobTitleCompetenciesManager
          jobTitleId={jt.id}
          assigned={assigned}
          allCompetencies={allCompetencies}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
