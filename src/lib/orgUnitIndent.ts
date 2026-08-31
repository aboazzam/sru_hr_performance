export interface IndentableUnit {
  id: string;
  parentId: string | null;
  /** `org_structure_levels.level_order`, or null when the unit has no level. */
  levelOrder: number | null;
}

/**
 * How far each unit is indented in the org units tree.
 *
 * Indentation used to be the unit's DEPTH in the tree, which made two units
 * at genuinely different ranks line up whenever they happened to share a
 * parent. Asked for on 2026-08-31: "اريد البادئة تكون اكبر كلما كان المستوى
 * اقل ف C4 تكون البادئة اكثر من C3" — the indent should follow the LEVEL.
 *
 * Note the levels are ordered, not numbered: `level_order` runs 1, 2, 3, 4,
 * 5, 6, 7, 8 over levels named 1, C2, C3, "الإدارات المرتبطة بالرئيس
 * مباشرة", "نائب الرئيس", C4, C5, C6 — so C4 sits at order 6, not 4. Ranking
 * by `level_order` is what makes C4 indent further than C3; reading the digit
 * out of the label would not.
 *
 * Steps are `level_order - 1`, so the first rank sits flush at zero. Measured
 * from the constant 1 rather than from the smallest level actually in use:
 * anchoring to the data would re-indent every unit on screen the moment
 * someone assigned a unit to a higher rank than any used before. `level_order`
 * is contiguous from 1 by construction -- reordering rewrites it as 1..N.
 *
 * A unit with NO level inherits its parent's indent plus one, rather than
 * falling back to tree depth: mixing the two scales would let an unlevelled
 * child render to the left of its own parent.
 *
 * A levelled unit is placed by its level even when that puts it left of its
 * parent. That is a faithful drawing of the data — a unit recorded at a
 * higher rank than its parent — and surfacing it beats hiding it.
 */
export function computeOrgUnitIndents(units: IndentableUnit[]): Map<string, number> {
  const childrenByParent = new Map<string | null, IndentableUnit[]>();
  for (const unit of units) {
    const list = childrenByParent.get(unit.parentId);
    if (list) list.push(unit);
    else childrenByParent.set(unit.parentId, [unit]);
  }

  const indents = new Map<string, number>();
  const known = new Set(units.map((unit) => unit.id));

  // Breadth-first from the roots, so a parent's own indent is always settled
  // before a child that has to inherit it. Anything whose parent is missing
  // from the list is treated as a root rather than dropped.
  const queue: Array<{ unit: IndentableUnit; parentIndent: number }> = units
    .filter((unit) => unit.parentId == null || !known.has(unit.parentId))
    .map((unit) => ({ unit, parentIndent: -1 }));

  while (queue.length > 0) {
    const { unit, parentIndent } = queue.shift()!;
    if (indents.has(unit.id)) continue; // guards a corrupted parent cycle
    const indent = unit.levelOrder != null ? unit.levelOrder - 1 : parentIndent + 1;
    indents.set(unit.id, Math.max(0, indent));
    for (const child of childrenByParent.get(unit.id) ?? []) {
      queue.push({ unit: child, parentIndent: indents.get(unit.id)! });
    }
  }

  return indents;
}
