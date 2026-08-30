import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ImportOrgUnitsExcelForm } from "@/components/ImportOrgUnitsExcelForm";
import { OrgUnitsManager, type OrgUnitRow } from "@/components/OrgUnitsManager";
import { OrgUnitClassificationsManager } from "@/components/OrgUnitClassificationsManager";
import type { OrgUnitClassification } from "@/lib/orgUnitTypes";
import type { UnitPosition, PositionOption } from "@/components/OrgUnitPositionsManager";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx.
//
// Until 2026-08-29 this screen rendered a copy of the org chart transcribed
// into the source tree (`src/lib/data/org-units.ts`) while every other screen
// read the `org_units` table — two versions of one fact, already one unit
// apart. It reads and writes the table now, and the transcription is gone.
//
// Row visibility is org_units_select's own RLS; editing is org_units_insert /
// org_units_update, both at employeeData>=approve. Those policies have
// existed since 20260716000006 with no consumer at all — the units could only
// be seeded by a migration until now.
export default async function OrgUnitsPage() {
  const t = await getTranslations("OrgUnitsPage");
  const supabase = await createClient();

  // Both classification lists are read separately rather than through a
  // PostgREST embed: they are also rendered on their own (the "manage
  // classifications" panel needs every value, including ones no unit uses
  // yet), and an embed would only return the ones already in use.
  const [{ data }, { data: kindRows }, { data: typeRows }, { data: levelRows }, { data: positionRows }] =
    await Promise.all([
    supabase
      .from("org_units")
      .select("id, name_ar, name_en, unit_code, kind_id, type_id, level_id, parent_id")
      .is("deleted_at", null)
      .order("name_ar"),
    supabase
      .from("org_unit_kinds")
      .select("id, code, name_ar, name_en, display_order")
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("org_unit_types")
      .select("id, code, name_ar, name_en, display_order")
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("org_structure_levels")
      .select("id, name_ar, level_order")
      .is("deleted_at", null)
      .order("level_order"),
    // The chart's own positions: a unit may hold several, and their parent
    // may sit in a different unit (a dean reports to the president), so the
    // whole list is needed, not just this page's units.
    supabase
      .from("org_structure_positions")
      .select("id, name_ar, name_en, level_id, parent_id, org_unit_id")
      .is("deleted_at", null)
      .order("name_ar"),
  ]);

  const units = (data ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    unit_code: string | null;
    kind_id: string;
    type_id: string | null;
    level_id: string | null;
    parent_id: string | null;
  }>;

  const levels = ((levelRows ?? []) as Array<{ id: string; name_ar: string }>).map((row) => ({
    id: row.id,
    nameAr: row.name_ar,
  }));
  const levelName = new Map(levels.map((level) => [level.id, level.nameAr]));
  const unitName = new Map(units.map((unit) => [unit.id, unit.name_ar]));

  const positions = (positionRows ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    level_id: string;
    parent_id: string | null;
    org_unit_id: string | null;
  }>;

  const positionsByUnit: Record<string, UnitPosition[]> = {};
  for (const position of positions) {
    if (!position.org_unit_id) continue;
    const list = positionsByUnit[position.org_unit_id] ?? [];
    list.push({
      id: position.id,
      nameAr: position.name_ar,
      nameEn: position.name_en,
      levelId: position.level_id,
      parentId: position.parent_id,
      orgUnitId: position.org_unit_id,
    });
    positionsByUnit[position.org_unit_id] = list;
  }
  const allPositions: PositionOption[] = positions.map((position) => ({
    id: position.id,
    nameAr: position.name_ar,
    unitNameAr: position.org_unit_id ? unitName.get(position.org_unit_id) ?? null : null,
  }));

  type ClassRow = { id: string; code: string; name_ar: string; name_en: string | null; display_order: number };
  const toClassification = (list: ClassRow[], column: "kind_id" | "type_id"): OrgUnitClassification[] =>
    list.map((row) => ({
      id: row.id,
      code: row.code,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      displayOrder: row.display_order,
      // Counted here, not in the database: the panel needs it to disable the
      // delete button, and this list is small enough that a second round trip
      // per row would be the wasteful choice.
      usageCount: units.filter((unit) => unit[column] === row.id).length,
    }));

  const kinds = toClassification((kindRows ?? []) as ClassRow[], "kind_id");
  const types = toClassification((typeRows ?? []) as ClassRow[], "type_id");
  const kindById = new Map(kinds.map((k) => [k.id, k]));
  const typeById = new Map(types.map((t) => [t.id, t]));

  const rows: OrgUnitRow[] = units.map((row) => ({
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    unitCode: row.unit_code,
    kindId: row.kind_id,
    kindNameAr: kindById.get(row.kind_id)?.nameAr ?? "",
    typeId: row.type_id,
    typeNameAr: row.type_id ? typeById.get(row.type_id)?.nameAr ?? null : null,
    levelId: row.level_id,
    levelNameAr: row.level_id ? levelName.get(row.level_id) ?? null : null,
    parentId: row.parent_id,
  }));

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const employeeDataLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "employeeData"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(employeeDataLevel, "approve");
  // Positions live in org_structure_positions, whose RLS is gated on
  // orgStructure -- a different permission from the units themselves, so it
  // is read separately rather than assumed to follow employeeData.
  const orgStructureLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "orgStructure"
    )?.vpra_level ?? "none";
  const canEditPositions = hasVpraAccess(orgStructureLevel, "recommend");

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
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        {/* Export lives beside the search inside the manager, because it
            honours that search — the same split the vacancies screen uses.
            Its PDF option replaces the old standalone print button. */}
        <div className="sru-actionbar no-print">{canEdit ? <ImportOrgUnitsExcelForm /> : null}</div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <GroupTabs groupKey="administration" current="org-units" />

      <OrgUnitClassificationsManager kinds={kinds} types={types} canEdit={canEdit} />

      {rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <OrgUnitsManager
          rows={rows}
          kinds={kinds}
          types={types}
          levels={levels}
          positionsByUnit={positionsByUnit}
          allPositions={allPositions}
          canEditPositions={canEditPositions}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
