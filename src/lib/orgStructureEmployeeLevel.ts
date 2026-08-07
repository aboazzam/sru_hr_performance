/**
 * Real feedback (2026-08-07): "بالنسبة لموظفو الوحدة اعرض فقط من هم دونه في
 * المستوى في نفس الوحدة ولا تعرض من هو أعلى منه" -- the staffing table's
 * and the org chart's "employees in this position's linked org unit" column
 * (built 2026-07-26/27, `buildDescendantOrgUnitIdsResolver`) only ever
 * matched by org unit membership, with no awareness of `org_structure_levels`
 * at all -- so a genuinely senior colleague sharing the same (or a
 * descendant) org unit as a position could appear in that position's own
 * "employees under it" list.
 *
 * An employee's own level is only knowable when they are themselves
 * directly staffed to some `org_structure_position` via
 * `org_structure_assignments` -- most employees have no such assignment yet
 * (staffing is sparse and grows over time), and for those this project's
 * own no-fabricated-data discipline means their level simply isn't known.
 * [استنتاج]: "لا تعرض من هو أعلى منه" is read as a targeted exclusion, not
 * a blanket "only show positively-confirmed subordinates" -- an employee
 * with no known assignment isn't provably above the position, so stays
 * included; only an employee whose OWN assigned position's level_order is
 * numerically at-or-above (i.e. same rank or more senior) is excluded.
 * `level_order` runs senior-to-junior (level 1 = the org's root), so
 * "below" means a strictly greater level_order than the position's own.
 */
export function buildEmployeeLevelOrderResolver(
  assignments: Array<{ position_id: string; employee_id: string }>,
  positionLevelOrderById: Map<string, number>
): Map<string, number> {
  const employeeLevelOrderById = new Map<string, number>();
  for (const a of assignments) {
    const levelOrder = positionLevelOrderById.get(a.position_id);
    if (levelOrder !== undefined) {
      employeeLevelOrderById.set(a.employee_id, levelOrder);
    }
  }
  return employeeLevelOrderById;
}

export function isBelowOrUnknownLevel(
  employeeId: string,
  positionLevelOrder: number | undefined,
  employeeLevelOrderById: Map<string, number>
): boolean {
  const employeeLevelOrder = employeeLevelOrderById.get(employeeId);
  if (employeeLevelOrder === undefined || positionLevelOrder === undefined) return true;
  return employeeLevelOrder > positionLevelOrder;
}
