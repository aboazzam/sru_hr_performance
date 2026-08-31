import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PositionStaffingRow } from "@/components/PositionStaffingRow";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { StaffingExportMenu } from "@/components/StaffingExportMenu";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Link } from "@/i18n/navigation";

// Auth is enforced centrally by (app)/layout.tsx; real write authorization
// (assign/unassign) is org_structure_assignments' own RLS
// (check_vpra_global('orgStructure','approve'), hr_admin-only per the
// seeded matrix — 20260722000004).
//
// 2026-08-31: this screen used to also carry the position's own builder
// fields (name/level/parent/org-unit link/color, delete) plus a rollup of
// every employee in a position's linked org unit — asked to be stripped
// back to the one thing left that has no other home: "نحتاج فقط التسكين".
// Positions are created and edited on /org-units now (OrgUnitPositionsManager),
// which is why this page only groups them by their org unit and offers a
// staffed/vacant badge plus an assign/unassign dialog per row.
export default async function OrgStructureStaffingPage() {
  const t = await getTranslations("OrgStructureStaffingPage");
  const supabase = await createClient();

  const { data: positionsData } = await supabase
    .from("org_structure_positions")
    .select("id, name_ar, name_en, org_unit_id")
    .is("deleted_at", null)
    .order("name_ar");
  const positions = (positionsData ?? []) as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    org_unit_id: string | null;
  }>;

  const { data: orgUnitsData } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .is("deleted_at", null);
  const orgUnitNameById = new Map(
    ((orgUnitsData ?? []) as Array<{ id: string; name_ar: string }>).map((unit) => [unit.id, unit.name_ar])
  );

  const { data: assignmentsData } = await supabase
    .from("org_structure_assignments")
    .select("id, position_id, employee_id, profiles(employee_number, full_name_ar)")
    .is("deleted_at", null);
  const assignments = (assignmentsData ?? []) as unknown as Array<{
    id: string;
    position_id: string;
    employee_id: string;
    profiles: { employee_number: string; full_name_ar: string } | null;
  }>;
  const assignmentsByPositionId = new Map<
    string,
    Array<{ id: string; employeeId: string; label: string }>
  >();
  for (const assignment of assignments) {
    const list = assignmentsByPositionId.get(assignment.position_id) ?? [];
    list.push({
      id: assignment.id,
      employeeId: assignment.employee_id,
      label: assignment.profiles ? `${assignment.profiles.employee_number} — ${assignment.profiles.full_name_ar}` : "—",
    });
    assignmentsByPositionId.set(assignment.position_id, list);
  }

  // employeeData=approve (hr_admin, per the seeded matrix) already grants
  // full profiles visibility — no additional filtering needed here, same
  // discipline as the existing /employees list page.
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
    .is("deleted_at", null)
    .order("full_name_ar", { ascending: true });
  const employeeOptions = ((employeesData ?? []) as Array<{ id: string; employee_number: string; full_name_ar: string }>).map(
    (employee) => ({ id: employee.id, label: `${employee.employee_number} — ${employee.full_name_ar}` })
  );

  // Grouped by the position's own linked org unit, not a tree — this screen
  // only needs "which positions live under which unit", the hierarchy among
  // units themselves is /org-units' job. A position with no link (or one
  // pointing at a deleted unit) lands in its own group instead of vanishing.
  const positionsByGroup = new Map<string, { name: string; positions: typeof positions }>();
  for (const position of positions) {
    const unitName = position.org_unit_id ? orgUnitNameById.get(position.org_unit_id) : undefined;
    const key = unitName ? position.org_unit_id! : "unlinked";
    const group = positionsByGroup.get(key) ?? { name: unitName ?? t("unlinkedGroupHeading"), positions: [] };
    group.positions.push(position);
    positionsByGroup.set(key, group);
  }
  const groups = Array.from(positionsByGroup.entries())
    .map(([key, group]) => ({
      key,
      name: group.name,
      positions: [...group.positions].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")),
    }))
    // The unlinked group always trails, whatever its Arabic-collation rank
    // among real unit names would otherwise put it.
    .sort((a, b) => {
      if (a.key === "unlinked") return 1;
      if (b.key === "unlinked") return -1;
      return a.name.localeCompare(b.name, "ar");
    });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/org-structure/staffing" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div className="sru-actionbar no-print">
          <ImportOrgStructureExcelForm />
          <StaffingExportMenu />
        </div>
      </div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 20 }}>
        {t("positionsManagedNote")}{" "}
        <Link href="/org-units" style={{ color: "var(--sru-purple)", fontWeight: 600 }}>
          {t("positionsManagedLink")}
        </Link>
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {positions.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>
          {t("noPositions")}{" "}
          <Link href="/org-units" style={{ color: "var(--sru-purple)", fontWeight: 600 }}>
            {t("positionsManagedLink")}
          </Link>
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((group) => (
            <div key={group.key} className="sru-card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{group.name}</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {group.positions.map((position) => (
                  <PositionStaffingRow
                    key={position.id}
                    positionId={position.id}
                    nameAr={position.name_ar}
                    nameEn={position.name_en}
                    assignments={assignmentsByPositionId.get(position.id) ?? []}
                    employees={employeeOptions}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
