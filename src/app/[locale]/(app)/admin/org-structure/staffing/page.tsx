import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StaffingUnitCard } from "@/components/StaffingUnitCard";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { StaffingExportMenu } from "@/components/StaffingExportMenu";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Link } from "@/i18n/navigation";
import { buildStaffingGroups, compareUnits, type StaffingUnitNode } from "@/lib/staffingUnitTree";

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
//
// 2026-09-01: units under "رئيس الجامعة" (per org_units.parent_id) now nest
// as cards inside cards down to whatever depth their real hierarchy goes,
// rather than each rendering as its own flat, unrelated card — "اعمل كرت
// كبير للادارة التنفيذية ... وداخلها كروت للادارات التابعة لها ... كرت داخل
// كرت داخل كرت بمجرد وضعنا التبعية". Nesting deliberately does NOT climb
// past رئيس الجامعة itself (confirmed directly: "يقف التعشيش عند نائب
// الرئيس ورؤوساء الادارات التنفيذية") -- unbounded nesting would collapse
// virtually the whole university into one card rooted at مجلس الأمناء,
// since almost every branch traces back there. Everything outside that
// subtree (councils, unlinked positions, ...) stays exactly as flat as
// before. See src/lib/staffingUnitTree.ts for the actual rule.
//
// 2026-09-02: ordering — of siblings within a card, and of the top-level
// cards among themselves — now follows each unit's own manually-set
// `sort_order` (drag-and-drop, built on /org-units) before falling back to
// alphabetical, rather than being purely alphabetical. This page never
// writes that column; it only reads it, same as everything else here.
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
    .select("id, name_ar, parent_id, sort_order")
    .is("deleted_at", null);
  const orgUnits = (orgUnitsData ?? []) as Array<{ id: string; name_ar: string; parent_id: string | null; sort_order: number }>;

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

  // "رئيس الجامعة"'s own subtree nests as cards inside cards; everything
  // else stays one flat card per unit, exactly as before — see the comment
  // above and src/lib/staffingUnitTree.ts for why the anchor is looked up
  // by name rather than a hardcoded ID, and why nesting stops there.
  const staffingPositions = positions.map((position) => ({
    id: position.id,
    nameAr: position.name_ar,
    nameEn: position.name_en,
    orgUnitId: position.org_unit_id,
  }));
  const orgUnitRefs = orgUnits.map((unit) => ({ id: unit.id, nameAr: unit.name_ar, parentId: unit.parent_id, sortOrder: unit.sort_order }));
  const { nestedRoots, flatGroups, unlinkedPositions } = buildStaffingGroups(staffingPositions, orgUnitRefs, "رئيس الجامعة");

  const flatAsNodes: StaffingUnitNode[] = flatGroups.map((group) => ({
    id: group.id,
    name: group.name,
    positions: group.positions,
    children: [],
    sortOrder: group.sortOrder,
  }));
  // Same tie-break rule buildStaffingGroups already applies within each of
  // these two arrays -- reused here to merge them into one ordered list.
  const topLevelCards = [...nestedRoots, ...flatAsNodes].sort(compareUnits);
  // The unlinked group always trails, whatever its sortOrder/Arabic-collation
  // rank among real unit names would otherwise put it -- it isn't a real
  // org_units row, so it has no sortOrder of its own to compare with.
  const unlinkedNode: StaffingUnitNode | null =
    unlinkedPositions.length > 0
      ? { id: "unlinked", name: t("unlinkedGroupHeading"), positions: unlinkedPositions, children: [], sortOrder: 0 }
      : null;

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
          {topLevelCards.map((node) => (
            <StaffingUnitCard key={node.id} node={node} depth={0} assignmentsByPositionId={assignmentsByPositionId} employees={employeeOptions} />
          ))}
          {unlinkedNode ? (
            <StaffingUnitCard node={unlinkedNode} depth={0} assignmentsByPositionId={assignmentsByPositionId} employees={employeeOptions} />
          ) : null}
        </div>
      )}
    </div>
  );
}
