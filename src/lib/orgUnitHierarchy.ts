/**
 * Real feedback (2026-07-26/27): the staffing table's org-unit-employees
 * column originally matched a position's linked org unit exactly, missing
 * anyone in a real child unit of it. The fix (a cycle-guarded BFS over
 * `org_units.parent_id`) was first written inline in the staffing page --
 * then the exact same gap was found again on the visual org chart, which
 * still only showed direct `org_structure_assignments`. Extracted here so
 * both consumers share one implementation instead of drifting apart again.
 */
export function buildDescendantOrgUnitIdsResolver(
  orgUnits: Array<{ id: string; parent_id: string | null }>
): (rootId: string) => Set<string> {
  const childrenByParentId = new Map<string, string[]>();
  for (const u of orgUnits) {
    if (!u.parent_id) continue;
    const list = childrenByParentId.get(u.parent_id) ?? [];
    list.push(u.id);
    childrenByParentId.set(u.parent_id, list);
  }

  return function descendantOrgUnitIds(rootId: string): Set<string> {
    const result = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const childId of childrenByParentId.get(current) ?? []) {
        if (result.has(childId)) continue; // guards against a corrupted cyclical parent_id chain
        result.add(childId);
        queue.push(childId);
      }
    }
    return result;
  };
}
