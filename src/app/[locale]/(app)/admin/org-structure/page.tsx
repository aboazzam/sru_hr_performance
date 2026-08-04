import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AddOrgStructureLevelForm } from "@/components/AddOrgStructureLevelForm";
import { AddOrgStructurePositionForm } from "@/components/AddOrgStructurePositionForm";
import { OrgStructureLevelCard } from "@/components/OrgStructureLevelCard";
import { OrgStructureLevelsList } from "@/components/OrgStructureLevelsList";
import { OrgStructurePositionMiniRow } from "@/components/OrgStructurePositionMiniRow";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { OrgStructureSetupWizard } from "@/components/OrgStructureSetupWizard";
import { OrgChartTree } from "@/components/OrgChartTree";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { defaultLevelColorSwatch, identityColorSwatches, SRU_DEFAULT_PRIMARY, SRU_DEFAULT_SECONDARY } from "@/lib/orgChartColors";
import { buildDescendantOrgUnitIdsResolver } from "@/lib/orgUnitHierarchy";

// Auth is enforced centrally by (app)/layout.tsx; real write authorization
// is org_structure_levels/positions' own RLS (check_vpra_global('orgStructure',
// 'recommend'), hr_admin+ per the seeded matrix). This page itself only
// requires 'view' to be visible at all (enforced by the SELECT policies).
//
// Real feedback (2026-07-25): a caller with only `orgStructure=view` was
// seeing the full builder (Add Level/Add Position forms, the editable
// levels/positions list, the Excel import) — all of that is a 'prepare'+
// action; 'view' should see only the read-only org chart tree.
export default async function OrgStructurePage() {
  const t = await getTranslations("OrgStructurePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const orgStructureLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "orgStructure"
    )?.vpra_level ?? "none";
  const canBuild = hasVpraAccess(orgStructureLevel, "prepare");

  const { data: levelsData } = await supabase
    .from("org_structure_levels")
    .select("id, name_ar, name_en, level_order, color")
    .is("deleted_at", null)
    .order("level_order", { ascending: true });

  const levels = (levelsData ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    level_order: number;
    color: string | null;
  }>;

  // Follow-up request (2026-07-25): offer the admin quick-pick swatches
  // derived from the REAL organization identity colors (configured on
  // /admin/identity), not just a fully custom picker. `identity=view` is a
  // separate process area from `orgStructure` (hr_admin doesn't hold it per
  // the 20260725000002 split) -- read failing/returning nothing under RLS is
  // expected for hr_admin, not an error, and falls back to the same SRU
  // defaults `[locale]/layout.tsx` itself falls back to.
  const { data: identity } = await supabase.from("org_identity").select("primary_color, secondary_color").maybeSingle();
  const identitySwatches = identityColorSwatches(
    identity?.primary_color ?? SRU_DEFAULT_PRIMARY,
    identity?.secondary_color ?? SRU_DEFAULT_SECONDARY
  );

  const { data: positionsData } = await supabase
    .from("org_structure_positions")
    .select("id, level_id, parent_id, name_ar, name_en, org_unit_id, job_title_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const positions = (positionsData ?? []) as Array<{
    id: string;
    level_id: string;
    parent_id: string | null;
    name_ar: string;
    name_en: string | null;
    org_unit_id: string | null;
    job_title_id: string | null;
  }>;
  const positionNameById = new Map(positions.map((p) => [p.id, p.name_ar]));

  // 2026-07-27: "اعرض المسميات الوظيفية على شاشة الهيكل التنظيمي" -- show
  // each position's linked job title (20260727000002/000003) on the chart
  // itself. `job_titles_select`'s own RLS (careerPath>=view OR
  // employeeData>=view) already covers every role that can reach this page
  // (hr_admin/super_admin both hold employeeData); a caller without either
  // grant simply gets an empty jobTitleNameById, and positions render with
  // no title line, same graceful-degradation posture as every other
  // optional lookup on this page.
  const jobTitleIds = Array.from(new Set(positions.map((p) => p.job_title_id).filter((id): id is string => !!id)));
  const { data: jobTitlesData } =
    jobTitleIds.length > 0 ? await supabase.from("job_titles").select("id, name_ar").in("id", jobTitleIds) : { data: [] };
  const jobTitleNameById = new Map(((jobTitlesData ?? []) as Array<{ id: string; name_ar: string }>).map((j) => [j.id, j.name_ar]));
  const jobTitleByPosition: Record<string, string> = {};
  for (const p of positions) {
    const name = p.job_title_id ? jobTitleNameById.get(p.job_title_id) : undefined;
    if (name) jobTitleByPosition[p.id] = name;
  }

  // 2026-07-26: optional position -> org unit link, closing the reported
  // gap between employees' own org unit and the org-chart tree. Same
  // `org_units_select` RLS every other org-unit-picking screen already
  // relies on (employeeData/vacancies view -- hr_admin/super_admin, the
  // only roles that reach `canBuild` below, already hold employeeData).
  const { data: orgUnitsData } = await supabase.from("org_units").select("id, name_ar, parent_id").is("deleted_at", null).order("name_ar");
  const orgUnits = (orgUnitsData ?? []) as Array<{ id: string; name_ar: string; parent_id: string | null }>;

  const { data: assignmentsData } = await supabase
    .from("org_structure_assignments")
    .select("position_id, profiles(id, full_name_ar)")
    .is("deleted_at", null);
  const assignments = (assignmentsData ?? []) as unknown as Array<{
    position_id: string;
    profiles: { id: string; full_name_ar: string } | null;
  }>;

  // 2026-07-27: the chart only ever showed employees directly staffed via
  // `org_structure_assignments`, missing anyone visible through a position's
  // org-unit link -- the exact gap already fixed on the staffing table's
  // own "موظفو الوحدة التنظيمية" column (real feedback: نائب الرئيس
  // showed only 1 of the 3 real employees under it). Merges both sources
  // here too, deduped by profile id since the same person can appear in
  // both (e.g. explicitly assigned AND a member of the linked org unit).
  const { data: employeesData } = await supabase.from("profiles").select("id, full_name_ar, org_unit_id").is("deleted_at", null);
  const employees = (employeesData ?? []) as Array<{ id: string; full_name_ar: string; org_unit_id: string | null }>;
  const employeesByOrgUnitId = new Map<string, Array<{ id: string; full_name_ar: string }>>();
  for (const e of employees) {
    if (!e.org_unit_id) continue;
    const list = employeesByOrgUnitId.get(e.org_unit_id) ?? [];
    list.push({ id: e.id, full_name_ar: e.full_name_ar });
    employeesByOrgUnitId.set(e.org_unit_id, list);
  }
  const descendantOrgUnitIds = buildDescendantOrgUnitIdsResolver(orgUnits);

  const assigneesByPositionEntries = new Map<string, Map<string, string>>();
  function addAssignee(positionId: string, employeeId: string, label: string) {
    const byEmployeeId = assigneesByPositionEntries.get(positionId) ?? new Map<string, string>();
    byEmployeeId.set(employeeId, label);
    assigneesByPositionEntries.set(positionId, byEmployeeId);
  }
  for (const a of assignments) {
    if (!a.profiles) continue;
    addAssignee(a.position_id, a.profiles.id, a.profiles.full_name_ar);
  }
  for (const p of positions) {
    if (!p.org_unit_id) continue;
    for (const unitId of descendantOrgUnitIds(p.org_unit_id)) {
      for (const e of employeesByOrgUnitId.get(unitId) ?? []) {
        addAssignee(p.id, e.id, e.full_name_ar);
      }
    }
  }
  const assigneesByPosition: Record<string, string[]> = {};
  for (const [positionId, byEmployeeId] of assigneesByPositionEntries) {
    assigneesByPosition[positionId] = Array.from(byEmployeeId.values());
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/org-structure" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {canBuild && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {levels.length > 0 && (
              <>
                <AddOrgStructureLevelForm />
                <AddOrgStructurePositionForm levels={levels} positions={positions} orgUnits={orgUnits} />
              </>
            )}
            <ImportOrgStructureExcelForm />
          </div>
        )}
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {levels.length === 0 ? (
        canBuild ? <OrgStructureSetupWizard /> : <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noPositions")}</p>
      ) : (
        <>
          <section style={{ marginBottom: 36 }}>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 4 }}>
              {t("orgChartHeading")}
            </h2>
            <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 14 }}>{t("orgChartSubtitle")}</p>
            <div className="sru-card">
              <OrgChartTree
                positions={positions}
                levels={levels.map((l) => ({ id: l.id, level_order: l.level_order, color: l.color }))}
                assigneesByPosition={assigneesByPosition}
                jobTitleByPosition={jobTitleByPosition}
                emptyLabel={t("noPositions")}
                vacantLabel={t("orgChartVacant")}
              />
            </div>
          </section>

          {canBuild && (
            <section>
              <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
                {t("levelsHeading")}
              </h2>
              <OrgStructureLevelsList
                items={levels.map((level, levelIndex) => {
                  const levelPositions = positions.filter((p) => p.level_id === level.id);
                  return {
                    id: level.id,
                    node: (
                      <OrgStructureLevelCard
                        levelId={level.id}
                        levelOrder={level.level_order}
                        initialNameAr={level.name_ar}
                        initialNameEn={level.name_en}
                        initialColor={level.color}
                        defaultColorSwatch={defaultLevelColorSwatch(levelIndex)}
                        identitySwatches={identitySwatches}
                      >
                        {levelPositions.length === 0 ? (
                          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noPositions")}</p>
                        ) : (
                          <div>
                            {levelPositions.map((position) => (
                              <OrgStructurePositionMiniRow
                                key={position.id}
                                positionId={position.id}
                                levelId={position.level_id}
                                initialNameAr={position.name_ar}
                                initialNameEn={position.name_en}
                                initialOrgUnitId={position.org_unit_id}
                                initialParentId={position.parent_id}
                                orgUnits={orgUnits}
                                levels={levels.map((l) => ({ id: l.id, level_order: l.level_order }))}
                                positions={positions.map((p) => ({
                                  id: p.id,
                                  name_ar: p.name_ar,
                                  level_id: p.level_id,
                                  parent_id: p.parent_id,
                                }))}
                                parentLabel={
                                  position.parent_id ? `${t("parentLabel")}: ${positionNameById.get(position.parent_id) ?? "—"}` : t("rootChip")
                                }
                              />
                            ))}
                          </div>
                        )}
                      </OrgStructureLevelCard>
                    ),
                  };
                })}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
