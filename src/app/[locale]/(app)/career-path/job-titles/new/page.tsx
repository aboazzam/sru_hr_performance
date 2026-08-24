import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { CreateJobTitleForm } from "@/components/CreateJobTitleForm";
import type { Locale } from "@/i18n/config";

// Same careerPath>=prepare gate as /career-path/job-titles and its [id]
// detail page — this is part of the same management screen.
export default async function CreateJobTitlePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations("CareerPathNewJobTitlePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const careerPathLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "careerPath"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(careerPathLevel, "prepare");

  if (!canEdit) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noPermission")}</p>
      </div>
    );
  }

  const { data: jobFamiliesData } = await supabase.from("job_families").select("id, name_ar").order("name_ar");
  const jobFamilies = ((jobFamiliesData as unknown as Array<{ id: string; name_ar: string }>) ?? []).map((f) => ({
    id: f.id,
    nameAr: f.name_ar,
  }));

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
  const allCompetenciesRows = (allCompetenciesData as unknown as Array<{ id: string; name_ar: string; domain_id: string; type: string }>) ?? [];
  const allCompetencies = allCompetenciesRows.map((c) => ({ id: c.id, nameAr: c.name_ar, pillarAr: domainPillar.get(c.domain_id) ?? "—" }));
  const coreCompetencies = allCompetenciesRows
    .filter((c) => c.type === "core")
    .map((c) => ({ id: c.id, nameAr: c.name_ar, pillarAr: domainPillar.get(c.domain_id) ?? "—" }));

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
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <Link href="/career-path/job-titles" className="sru-btn">
          {t("backToList")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <CreateJobTitleForm
        locale={locale}
        jobFamilies={jobFamilies}
        coreCompetencies={coreCompetencies}
        allCompetencies={allCompetencies}
        allJobTitles={allJobTitles}
      />
    </div>
  );
}
