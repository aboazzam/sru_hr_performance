/**
 * Shared parent-option logic for editing an existing `org_structure_positions`
 * row's `parent_id` (2026-08-05, "اضف خاصية تغيير التبعية للمنصب") --
 * extracted so `OrgStructurePositionMiniRow`/`OrgStructurePositionRow` (the
 * builder and staffing screens) can't drift the way earlier org-structure
 * fixes already did once (see `orgUnitHierarchy.ts`'s own history).
 *
 * Mirrors `AddOrgStructurePositionForm`'s own parent-option rule exactly:
 * any position at a level ABOVE the position's own level (lower
 * `level_order`), not just the immediately preceding one --
 * `validate_org_structure_position_parent()` only blocks a self-parent and
 * cycles since migration 20260724000001, not a fixed one-level-up hop.
 *
 * The position's own descendants are also excluded client-side, even though
 * the level-order filter alone already makes a cycle structurally
 * unreachable for any tree built entirely through this UI (a child's level
 * is always required to be numerically greater than its parent's) -- this
 * is a defensive backstop for positions whose level ordering doesn't follow
 * that convention (e.g. rows created by an earlier bulk import), so an
 * obviously cyclical choice never appears as pickable instead of only
 * surfacing as a raw server-side rejection.
 */

export interface PositionLevelInfo {
  id: string;
  level_id: string;
  parent_id: string | null;
}

export interface LevelOrderInfo {
  id: string;
  level_order: number;
}

export function isRootLevelOrder(ownLevelOrder: number | undefined, levels: LevelOrderInfo[]): boolean {
  if (ownLevelOrder == null || levels.length === 0) return false;
  const minLevelOrder = Math.min(...levels.map((l) => l.level_order));
  return ownLevelOrder === minLevelOrder;
}

/** BFS over `parent_id` to find every position reachable downward from `positionId` (excluding itself). */
export function computeDescendantPositionIds<T extends PositionLevelInfo>(positionId: string, positions: T[]): Set<string> {
  const childrenByParentId = new Map<string, string[]>();
  for (const p of positions) {
    if (!p.parent_id) continue;
    const list = childrenByParentId.get(p.parent_id) ?? [];
    list.push(p.id);
    childrenByParentId.set(p.parent_id, list);
  }

  // `visited` seeds with `positionId` itself purely as a cycle guard; the
  // returned set never includes it, even on a corrupted cyclical parent_id
  // chain that loops back to the starting position.
  const visited = new Set<string>([positionId]);
  const descendantIds = new Set<string>();
  const queue = [positionId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const childId of childrenByParentId.get(current) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      descendantIds.add(childId);
      queue.push(childId);
    }
  }
  return descendantIds;
}

/**
 * Positions eligible as `positionId`'s new parent: any position at a
 * strictly lower `level_order`, excluding `positionId` itself and its own
 * descendants -- sorted closest-level-first, same as
 * `AddOrgStructurePositionForm`'s own ordering.
 */
export function computeEligibleParentPositions<T extends PositionLevelInfo>(
  positionId: string,
  ownLevelOrder: number | undefined,
  levels: LevelOrderInfo[],
  positions: T[]
): T[] {
  const levelOrderById = new Map(levels.map((l) => [l.id, l.level_order]));
  const descendantIds = computeDescendantPositionIds(positionId, positions);

  return positions
    .filter(
      (p) =>
        p.id !== positionId &&
        !descendantIds.has(p.id) &&
        (levelOrderById.get(p.level_id) ?? Infinity) < (ownLevelOrder ?? -Infinity)
    )
    .slice()
    .sort((a, b) => (levelOrderById.get(b.level_id) ?? 0) - (levelOrderById.get(a.level_id) ?? 0));
}
