import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignEmployeeForm } from "@/components/AssignEmployeeForm";
import { OrgStructurePositionRow } from "@/components/OrgStructurePositionRow";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { GroupTabs } from "@/components/layout/GroupTabs";

// Auth is enforced centrally by (app)/layout.tsx; real write authorization
// (assign/unassign/edit/add position) is each table's own RLS
// (check_vpra_global('orgStructure','approve'), hr_admin-only per the
// seeded matrix — 20260722000004).
export default async function OrgStructureStaffingPage() {
  const t = await getTranslations("OrgStructureStaffingPage");
  const supabase = await createClient();

  const { data: levelsData } = await supabase
    .from("org_structure_levels")
    .select("id, name_ar, level_order")
    .is("deleted_at", null)
    .order("level_order", { ascending: true });
  const levels = (levelsData ?? []) as Array<{ id: string; name_ar: string; level_order: number }>;
  const levelNameById = new Map(levels.map((l) => [l.id, l.name_ar]));

  const { data: positionsData } = await supabase
    .from("org_structure_positions")
    .select("id, level_id, parent_id, name_ar, name_en, org_unit_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const positions = (positionsData ?? []) as Array<{
    id: string;
    level_id: string;
    parent_id: string | null;
    name_ar: string;
    name_en: string | null;
    org_unit_id: string | null;
  }>;
  const positionNameById = new Map(positions.map((p) => [p.id, p.name_ar]));

  // 2026-07-26: optional position -> org unit link, closing the reported
  // gap between employees' own org unit and the org-chart tree ("لا نجد
  // الموظفين التابعين لمدير ادارة معينة"). Same `org_units_select` RLS
  // every other org-unit-picking screen already relies on.
  const { data: orgUnitsData } = await supabase.from("org_units").select("id, name_ar").is("deleted_at", null).order("name_ar");
  const orgUnits = (orgUnitsData ?? []) as Array<{ id: string; name_ar: string }>;

  const { data: assignmentsData } = await supabase
    .from("org_structure_assignments")
    .select("id, position_id, profiles(employee_number, full_name_ar)")
    .is("deleted_at", null);
  const assignments = (assignmentsData ?? []) as unknown as Array<{
    id: string;
    position_id: string;
    profiles: { employee_number: string; full_name_ar: string } | null;
  }>;

  // employeeData=approve (hr_admin, per the seeded matrix) already grants
  // full profiles visibility — no additional filtering needed here, same
  // discipline as the existing /employees list page.
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, org_unit_id")
    .is("deleted_at", null)
    .order("full_name_ar", { ascending: true });
  const employees = (employeesData ?? []) as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    org_unit_id: string | null;
  }>;

  // Employees whose OWN org unit matches a position's linked org unit —
  // the real answer to "لا نجد الموظفين التابعين لمدير ادارة معينة",
  // distinct from `assignments` below (who is individually staffed onto
  // this exact position node).
  const employeesByOrgUnitId = new Map<string, string[]>();
  for (const e of employees) {
    if (!e.org_unit_id) continue;
    const list = employeesByOrgUnitId.get(e.org_unit_id) ?? [];
    list.push(`${e.employee_number} — ${e.full_name_ar}`);
    employeesByOrgUnitId.set(e.org_unit_id, list);
  }

  const positionOptions = positions.map((p) => ({
    id: p.id,
    label: `${levelNameById.get(p.level_id) ?? "—"} — ${p.name_ar}`,
  }));
  const employeeOptions = employees.map((e) => ({ id: e.id, label: `${e.employee_number} — ${e.full_name_ar}` }));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/org-structure/staffing" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ImportOrgStructureExcelForm />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <section style={{ marginBottom: 30, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <AssignEmployeeForm positions={positionOptions} employees={employeeOptions} />
      </section>

      <section>
        {positions.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noPositions")}</p>
        ) : (
          <div className="sru-card">
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("positionColumnLevel")}</th>
                    <th>{t("positionColumnParent")}</th>
                    <th>{t("positionColumnName")}</th>
                    <th>{t("positionColumnAssigned")}</th>
                    <th>{t("positionColumnOrgUnitEmployees")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const positionAssignments = assignments
                      .filter((a) => a.position_id === position.id)
                      .map((a) => ({
                        id: a.id,
                        label: a.profiles ? `${a.profiles.employee_number} — ${a.profiles.full_name_ar}` : "—",
                      }));
                    return (
                      <OrgStructurePositionRow
                        key={position.id}
                        levelName={levelNameById.get(position.level_id) ?? "—"}
                        parentName={position.parent_id ? positionNameById.get(position.parent_id) ?? "—" : t("rootChip")}
                        positionId={position.id}
                        initialNameAr={position.name_ar}
                        initialNameEn={position.name_en}
                        initialOrgUnitId={position.org_unit_id}
                        orgUnits={orgUnits}
                        assignments={positionAssignments}
                        orgUnitEmployeeLabels={position.org_unit_id ? employeesByOrgUnitId.get(position.org_unit_id) ?? [] : []}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
