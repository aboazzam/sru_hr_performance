import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { PrintButton } from "@/components/PrintButton";
import { OrgUnitsManager, type OrgUnitRow } from "@/components/OrgUnitsManager";
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

  const { data } = await supabase
    .from("org_units")
    .select("id, name_ar, name_en, unit_code, kind, parent_id")
    .is("deleted_at", null)
    .order("name_ar");

  const rows: OrgUnitRow[] = (
    (data ?? []) as Array<{
      id: string;
      name_ar: string;
      name_en: string | null;
      unit_code: string | null;
      kind: string;
      parent_id: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    unitCode: row.unit_code,
    kind: row.kind,
    parentId: row.parent_id,
  }));

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const employeeDataLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "employeeData"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(employeeDataLevel, "approve");

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
        <div className="sru-actionbar no-print">
          <PrintButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <GroupTabs groupKey="administration" current="org-units" />

      {rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <OrgUnitsManager rows={rows} canEdit={canEdit} />
      )}
    </div>
  );
}
