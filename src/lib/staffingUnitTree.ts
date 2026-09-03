/**
 * Groups staffing positions by their organizational unit, nesting the
 * subtree under a single named "anchor" unit (in production, "رئيس
 * الجامعة") into cards inside cards -- the rest of the university stays
 * flat, one card per unit, exactly as before.
 *
 * 2026-09-01 request: "اعمل كرت كبير للادارة التنفيذية للاتصالات وتقنية
 * المعلومات وداخلها كروت للادارات التابعة لها بمجرد وضعنا التبعية ... ومثلها
 * نائب الرئيس للشؤون الاكاديمية وتحته النواب ثم من تحتهم فاجعل كرت داخل
 * كرت داخل كرت بمجرد وضعنا التبعية" -- followed up with "يقف التعشيش عند
 * نائب الرئيس ورؤوساء الادارات التنفيذية" once asked where nesting should
 * stop climbing (full unbounded nesting collapses the whole university into
 * one card rooted at مجلس الأمناء, since virtually every branch eventually
 * traces back there).
 *
 * The anchor is not hardcoded by ID -- it's found by name at call time, so
 * this keeps working if the anchor unit is ever recreated with a new ID,
 * and degrades to fully flat grouping (today's behavior) if the name isn't
 * found at all, rather than crashing or guessing.
 *
 * Every DIRECT CHILD of the anchor becomes a nesting root, whether or not
 * it holds a position of its own -- "نائب الرئيس للشؤون الأكاديمية" holds
 * none directly (its own position lives on a child "مكتب" unit), yet must
 * still wrap its assistant-VP branches. A unit only needs an ancestor OR a
 * descendant with a position to earn a place in the tree; branches with
 * neither are pruned rather than rendered as empty cards.
 *
 * 2026-09-02: ordering at every level -- siblings within a card, and the
 * top-level cards themselves -- now follows each unit's own `sortOrder`
 * (manually set via drag-and-drop on /org-units) before falling back to
 * alphabetical, instead of always being purely alphabetical. See
 * `compareUnits` below.
 */

export interface StaffingPosition {
  id: string;
  nameAr: string;
  nameEn: string | null;
  orgUnitId: string | null;
}

export interface OrgUnitRef {
  id: string;
  nameAr: string;
  parentId: string | null;
  /** Manual drag-to-reorder value among siblings sharing the same parent -- see org_units.sort_order. */
  sortOrder: number;
}

export interface StaffingUnitNode {
  id: string;
  name: string;
  positions: StaffingPosition[];
  children: StaffingUnitNode[];
  sortOrder: number;
}

export interface StaffingGroups {
  /** Direct children of the anchor unit, each the root of its own nested subtree. */
  nestedRoots: StaffingUnitNode[];
  /** Every other unit with positions of its own, one flat card each -- unchanged from before nesting existed. */
  flatGroups: Array<{ id: string; name: string; positions: StaffingPosition[]; sortOrder: number }>;
  /** Positions whose org_unit_id is missing or points at a unit not in `orgUnits`. */
  unlinkedPositions: StaffingPosition[];
}

/**
 * The shared tie-break rule for anything carrying a `sortOrder`/`name` pair
 * -- lower `sortOrder` first, alphabetical (Arabic collation) when equal.
 * Exported so the page-level merge of `nestedRoots` and `flatGroups` (two
 * arrays this module returns separately) can order them together the same
 * way, without re-implementing the comparison.
 */
export function compareUnits(a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ar");
}

// A corrupted parent_id chain (a cycle) must not hang the page -- this many
// hops covers the real ~5-level-deep tree many times over.
const MAX_DEPTH = 30;

export function buildStaffingGroups(
  positions: StaffingPosition[],
  orgUnits: OrgUnitRef[],
  anchorUnitName: string
): StaffingGroups {
  const unitById = new Map(orgUnits.map((u) => [u.id, u]));
  const anchor = orgUnits.find((u) => u.nameAr === anchorUnitName);

  const childrenOf = new Map<string, string[]>();
  for (const unit of orgUnits) {
    if (!unit.parentId) continue;
    const list = childrenOf.get(unit.parentId) ?? [];
    list.push(unit.id);
    childrenOf.set(unit.parentId, list);
  }

  const positionsByUnit = new Map<string, StaffingPosition[]>();
  const unlinkedPositions: StaffingPosition[] = [];
  for (const position of positions) {
    if (!position.orgUnitId || !unitById.has(position.orgUnitId)) {
      unlinkedPositions.push(position);
      continue;
    }
    const list = positionsByUnit.get(position.orgUnitId) ?? [];
    list.push(position);
    positionsByUnit.set(position.orgUnitId, list);
  }

  // Walks up from `unitId` and returns the ancestor (or the unit itself)
  // that is a direct child of the anchor -- null if the unit isn't under
  // the anchor's subtree at all (or there is no anchor).
  function nestingRootOf(unitId: string): string | null {
    if (!anchor) return null;
    let current = unitById.get(unitId);
    let hops = 0;
    while (current && hops < MAX_DEPTH) {
      if (current.parentId === anchor.id) return current.id;
      if (!current.parentId) return null;
      current = unitById.get(current.parentId);
      hops++;
    }
    return null;
  }

  const hasPositionsInSubtree = new Map<string, boolean>();
  function subtreeHasPositions(unitId: string, depth = 0): boolean {
    if (depth > MAX_DEPTH) return false;
    const cached = hasPositionsInSubtree.get(unitId);
    if (cached !== undefined) return cached;
    hasPositionsInSubtree.set(unitId, false); // cycle guard while resolving
    const ownHas = (positionsByUnit.get(unitId)?.length ?? 0) > 0;
    const result = ownHas || (childrenOf.get(unitId) ?? []).some((kidId) => subtreeHasPositions(kidId, depth + 1));
    hasPositionsInSubtree.set(unitId, result);
    return result;
  }

  function buildNode(unitId: string, depth = 0): StaffingUnitNode {
    const unit = unitById.get(unitId)!;
    const children =
      depth >= MAX_DEPTH
        ? []
        : (childrenOf.get(unitId) ?? [])
            .filter((kidId) => subtreeHasPositions(kidId, depth + 1))
            .sort((a, b) => {
              const unitA = unitById.get(a)!;
              const unitB = unitById.get(b)!;
              return compareUnits({ sortOrder: unitA.sortOrder, name: unitA.nameAr }, { sortOrder: unitB.sortOrder, name: unitB.nameAr });
            })
            .map((kidId) => buildNode(kidId, depth + 1));
    return { id: unitId, name: unit.nameAr, positions: positionsByUnit.get(unitId) ?? [], children, sortOrder: unit.sortOrder };
  }

  const rootIds = new Set<string>();
  const flatUnitIds = new Set<string>();
  for (const unitId of positionsByUnit.keys()) {
    const rootId = nestingRootOf(unitId);
    if (rootId) rootIds.add(rootId);
    else flatUnitIds.add(unitId);
  }

  const nestedRoots = Array.from(rootIds)
    .map((id) => buildNode(id))
    .sort(compareUnits);

  const flatGroups = Array.from(flatUnitIds)
    .map((id) => ({ id, name: unitById.get(id)!.nameAr, positions: positionsByUnit.get(id)!, sortOrder: unitById.get(id)!.sortOrder }))
    .sort(compareUnits);

  return { nestedRoots, flatGroups, unlinkedPositions };
}
