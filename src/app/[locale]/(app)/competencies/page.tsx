import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CompetenciesExportMenu } from "@/components/CompetenciesExportMenu";
import { ImportCompetenciesExcelForm } from "@/components/ImportCompetenciesExcelForm";
import { AddCompetencyPillarForm } from "@/components/AddCompetencyPillarForm";
import { AddCompetencyDomainForm } from "@/components/AddCompetencyDomainForm";
import { AddCompetencyForm } from "@/components/AddCompetencyForm";
import { AddCompetencyClassificationForm } from "@/components/AddCompetencyClassificationForm";
import { CompetencyClassificationRow } from "@/components/CompetencyClassificationRow";
import { CompetencyPillarCard } from "@/components/CompetencyPillarCard";
import { CompetencyDomainCard } from "@/components/CompetencyDomainCard";
import { CompetencyManageCard } from "@/components/CompetencyManageCard";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import {
  groupCompetencyFramework,
  type CompetencyClassificationRow as CompetencyClassificationRowType,
  type CompetencyLevelRow,
  type CompetencyRow,
  type CompetencyDomainRow,
  type CompetencyPillarRow,
} from "@/lib/competencyFramework";

// The framework used to be read from a static, seed-time-only file
// (src/lib/data/competencies.ts) even though a full CRUD-ready schema has
// existed in the database since 20260716000002 -- CLAUDE.md §3's "Client can
// add pillars"/"Client can add competencies" was never actually buildable.
// This page now reads the live tables directly and, for `competencyFramework
// >= prepare` callers, offers the add/edit/archive affordances that close
// that gap. A `view`-only caller (or an unauthenticated pre-redirect request)
// sees exactly the old read-only rendering, no management UI at all.
export default async function CompetenciesPage() {
  const t = await getTranslations("CompetenciesPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const competencyFrameworkLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "competencyFramework"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(competencyFrameworkLevel, "prepare");
  const canDeleteStructure = hasVpraAccess(competencyFrameworkLevel, "approve");

  const [
    { data: pillarsData },
    { data: domainsData },
    { data: competenciesData },
    { data: levelsData },
    { data: jobFamiliesData },
    { data: classificationsData },
  ] = await Promise.all([
    supabase.from("competency_pillars").select("id, name_ar, name_en").order("name_ar"),
    supabase.from("competency_domains").select("id, pillar_id, name_ar, name_en").order("name_ar"),
    supabase
      .from("competencies")
      .select("id, domain_id, name_ar, classification_id, definition_ar, expected_impact_ar, job_family_id")
      .is("deleted_at", null)
      .order("name_ar"),
    supabase.from("competency_levels").select("competency_id, level, behavior_ar, behavior_en"),
    supabase.from("job_families").select("id, name_ar").order("name_ar"),
    supabase.from("competency_classifications").select("id, name_ar, name_en, auto_apply_everywhere").order("name_ar"),
  ]);

  const pillars = (pillarsData ?? []) as CompetencyPillarRow[];
  const domains = (domainsData ?? []) as CompetencyDomainRow[];
  const competencies = (competenciesData ?? []) as CompetencyRow[];
  const levels = (levelsData ?? []) as CompetencyLevelRow[];
  const jobFamilies = (jobFamiliesData ?? []) as Array<{ id: string; name_ar: string }>;
  const classifications = (classificationsData ?? []) as CompetencyClassificationRowType[];

  const grouped = groupCompetencyFramework(pillars, domains, competencies, levels);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("subtitle", { pillars: pillars.length, domains: domains.length, competencies: competencies.length })}
          </p>
        </div>
        {/* Same sru-actionbar class المبادرات/الخطة use, not a copy of it, so this
            row never drifts from theirs (2026-08-29 request: "بالشكل واللون
            والحجم كما في الصورة المتعلقة بالمبادرات"). */}
        <div className="sru-actionbar no-print">
          {canManage && <AddCompetencyClassificationForm />}
          {canManage && <AddCompetencyPillarForm />}
          {canManage && <ImportCompetenciesExcelForm />}
          <CompetenciesExportMenu />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {canManage && (
        <section className="no-print" style={{ marginBottom: 32 }}>
          <h2 className="sru-title" style={{ fontSize: 16.5, marginBottom: 10 }}>
            {t("classificationsHeading")}
          </h2>
          {classifications.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noClassificationsYet")}</p>
          ) : (
            classifications.map((c) => (
              <CompetencyClassificationRow
                key={c.id}
                classificationId={c.id}
                initialNameAr={c.name_ar}
                initialNameEn={c.name_en}
                initialAutoApplyEverywhere={c.auto_apply_everywhere}
                canDelete={canDeleteStructure}
              />
            ))
          )}
        </section>
      )}

      {grouped.length === 0 && (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noPillarsYet")}</p>
      )}

      {grouped.map((pillar, pillarIndex) => (
        <CompetencyPillarCard
          key={pillar.id}
          pillarId={pillar.id}
          orderNumber={pillarIndex + 1}
          initialNameAr={pillar.name_ar}
          initialNameEn={pillar.name_en}
          canManage={canManage}
          canDelete={canDeleteStructure}
        >
          {canManage && (
            <div className="no-print" style={{ marginBottom: 14 }}>
              <AddCompetencyDomainForm pillarId={pillar.id} />
            </div>
          )}

          {pillar.domains.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noDomainsYet")}</p>
          ) : (
            pillar.domains.map((domain, domainIndex) => (
              <CompetencyDomainCard
                key={domain.id}
                domainId={domain.id}
                orderNumber={domainIndex + 1}
                initialNameAr={domain.name_ar}
                initialNameEn={domain.name_en}
                canManage={canManage}
                canDelete={canDeleteStructure}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {domain.competencies.length === 0 ? (
                    <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noCompetenciesYet")}</p>
                  ) : (
                    domain.competencies.map((c) => (
                      <CompetencyManageCard
                        key={c.id}
                        competencyId={c.id}
                        initialNameAr={c.name_ar}
                        initialClassificationId={c.classification_id}
                        initialDefinitionAr={c.definition_ar}
                        initialExpectedImpactAr={c.expected_impact_ar}
                        initialJobFamilyId={c.job_family_id}
                        initialLevels={c.levels}
                        jobFamilies={jobFamilies}
                        classifications={classifications}
                        canManage={canManage}
                      />
                    ))
                  )}
                  {canManage && (
                    <div className="no-print">
                      <AddCompetencyForm domainId={domain.id} jobFamilies={jobFamilies} classifications={classifications} />
                    </div>
                  )}
                </div>
              </CompetencyDomainCard>
            ))
          )}
        </CompetencyPillarCard>
      ))}
    </div>
  );
}
