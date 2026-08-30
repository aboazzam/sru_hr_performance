"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Minus, Plus, Scan, Users } from "lucide-react";
import { getContrastTextColor } from "@/lib/color";

interface OrgChartPosition {
  id: string;
  parent_id: string | null;
  level_id: string;
  name_ar: string;
  name_en: string | null;
  /** 2026-08-29: membership in a visual group (org_structure_position_groups), NULL = ordinary main-pyramid node. */
  group_id: string | null;
  /** 2026-08-29: per-position color override, same convention as level.color -- NULL falls back to the level/theme color. */
  color: string | null;
}

interface OrgChartLevel {
  id: string;
  level_order: number;
  /** Admin override hex (2026-07-25); NULL falls back to the theme rotation below. */
  color: string | null;
}

/**
 * 2026-08-29: a real, data-driven replacement for the old name-string
 * `isBranchContainer` heuristic. A group pulls SOME (not necessarily all) of
 * one real parent's children out of the shared main-pyramid grid and renders
 * them together as a branch below/beside that parent -- 'vertical' as a
 * single stacked column (spine + one short tick per member), 'horizontal' as
 * a fan-out (the same computeSlots-based mini-pyramid this component already
 * used for every "الإدارة التنفيذية/النائب المساعد" branch). `parent_id`
 * never changes because of grouping -- a group only changes how something is
 * DRAWN, never what it reports to.
 */
interface OrgChartGroup {
  id: string;
  parent_id: string;
  layout: "horizontal" | "vertical";
}

/** 2026-08-29: a secondary, non-reporting "dotted-line" relationship between two positions (e.g. لجنة المراجعة <-> إدارة المراجعة الداخلية, "وظيفيًا"). */
interface OrgChartFunctionalLine {
  id: string;
  from_position_id: string;
  to_position_id: string;
  label_ar: string | null;
}

interface NodeColor {
  bg: string;
  fg: string;
}

interface ConnectorLine {
  id: string;
  d: string;
  dashed?: boolean;
}

interface FunctionalLineLabel {
  id: string;
  x: number;
  y: number;
  text: string;
}

// 2026-08-28: rebuilt from the column-per-level (vertical) layout back to
// the classic top-down pyramid (root at top, each level a horizontal row
// below it) -- direct request for a "hierarchical, screen-sized" chart.
// Auto-fit scaling (below) fixes the recurring overflow complaints this
// component has been rebuilt twice to chase on a single axis at a time.
const SLOT_WIDTH = 226; // horizontal spacing per sibling slot in the main pyramid -- node width (190px) is set in globals.css
// 240, not the original 188: a vertical group anchored one row above another
// occupied row (e.g. رئيس الجامعة's LEFT/RIGHT groups, which sit between
// رئيس's own row and the next occupied one two rows down) needs enough
// clearance to fit its own members before reaching that next row -- found
// live against real production data that 188 left only a ~70px margin,
// too tight once a group's last member and a same-column row-below item are
// both tall (e.g. a position with many real assignees).
const LEVEL_HEIGHT = 240;
// 0.28 (this component's original floor, from before this session's groups
// work) made real text unreadable once auto-fit actually hit the floor --
// direct feedback ("المعاينة غير واضح والخط غير مقروء عند التكبير") after
// the real tree grew from 49 to 60 positions across deeper group nesting,
// pushing auto-fit down to exactly that floor by default. Raised so the
// SMALLEST the chart is ever allowed to render still keeps text legible;
// a chart this size no longer fully fits an ordinary viewport at a readable
// scale, and the wrapper's own scrolling (never `overflow:hidden`, see its
// own comment) is the accepted tradeoff -- matching this component's
// existing "never silently clip, scroll instead" design.
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const ZOOM_STEP = 0.18;

// 'horizontal' group layout: everything under it fans out exactly like the
// old name-matched branch containers did -- same constants, same
// computeSlots-driven spacing, so a group with a single member whose own
// children have further children still reads the same as before.
const BRANCH_SLOT_WIDTH = 168; // horizontal spacing per sibling slot within one horizontal group's own fan-out
const BRANCH_ROW_HEIGHT = 68; // vertical spacing per depth row within one horizontal group's own fan-out
const BRANCH_TOP_GAP = 26; // gap between a group's anchor and its horizontal fan-out's first row

// 'vertical' group layout (2026-08-29, matches the approved mockup): every
// member stacks directly below its real parent at the SAME horizontal
// position, one per row, connected by one shared vertical spine (offset to
// one side of the node column, so it never runs through a box's own
// interior) with a short independent tick into each member -- not a single
// continuous line through every box, which would visually read as "item 1
// is item 2's own parent" rather than "these are all siblings of the same
// real parent". Row height and the anchor gap are generous, not tight --
// layout is computed BEFORE the real DOM exists (useMemo, ahead of the
// separate connector-line measuring effect), so it can't know a specific
// box's real rendered height in advance; found live against real production
// data that a position with many real assignees (e.g. رئيس الجامعة with 11
// names on one node) renders far taller than a typically-vacant "شاغر" leaf,
// so the gap/row-height must comfortably clear the TALLEST realistic case,
// not the average one.
const VERTICAL_ROW_HEIGHT = 110;
const VERTICAL_TOP_GAP = 60;
const VERTICAL_SPINE_GUTTER = 60; // spine offset from the node column's own edge
const BRANCH_NODE_WIDTH = 152; // must match .sru-orgchart-node-branch's width in globals.css
// When more than one group anchors to the SAME real parent (e.g. رئيس
// الجامعة's LEFT and RIGHT vertical groups) each group needs its own
// horizontal column -- found live that without this, two groups sharing an
// anchor rendered every member at the identical (x, y), fully overlapping.
const GROUP_COLUMN_SPACING = 210;

// Derived tints/shades of the two SRU identity hues (purple + blue) only —
// CLAUDE.md §7 forbids colors outside the SRU palette, so "colorful" here
// means varied depth within that palette, not an arbitrary rainbow. These
// stay CSS var() references (not literal hex) so a custom org_identity
// theme still shows through automatically for any level without an admin
// override — see src/lib/orgChartColors.ts for the literal-hex equivalents
// used only by the level color picker's <input type="color">.
const THEME_NODE_COLORS: NodeColor[] = [
  { bg: "var(--sru-purple)", fg: "#fff" },
  { bg: "var(--sru-blue)", fg: "#fff" },
  { bg: "#8a5cc4", fg: "#fff" },
  { bg: "#3f9dc9", fg: "#fff" },
  { bg: "var(--sru-purple-light)", fg: "var(--sru-purple-dark)" },
  { bg: "var(--sru-blue-light)", fg: "var(--sru-blue)" },
];

/**
 * Assigns every position a "slot" via a classic tree-layout leaf-ordering
 * pass: each LEAF gets the next sequential slot in traversal order, and
 * each internal node's slot is the average of its own children's slots.
 * Two positions that don't share a subtree end up in genuinely different
 * slots even when they'd otherwise render at the same tree depth. Only
 * looks at the positions it's given, treating anything whose parent isn't
 * IN that list as a root of its own -- which is exactly what lets both the
 * main pyramid and every group's own local layout below reuse it unchanged.
 */
function computeSlots(positions: OrgChartPosition[]): { slotOf: Map<string, number>; leafCount: number } {
  const positionById = new Map(positions.map((p) => [p.id, p]));
  const childrenByParentId = new Map<string, OrgChartPosition[]>();
  for (const p of positions) {
    if (!p.parent_id || !positionById.has(p.parent_id)) continue;
    const list = childrenByParentId.get(p.parent_id);
    if (list) list.push(p);
    else childrenByParentId.set(p.parent_id, [p]);
  }

  const slotOf = new Map<string, number>();
  let nextLeaf = 0;

  function visit(p: OrgChartPosition): number {
    const children = childrenByParentId.get(p.id) ?? [];
    if (children.length === 0) {
      const slot = nextLeaf;
      nextLeaf += 1;
      slotOf.set(p.id, slot);
      return slot;
    }
    const childSlots = children.map(visit);
    const slot = childSlots.reduce((sum, s) => sum + s, 0) / childSlots.length;
    slotOf.set(p.id, slot);
    return slot;
  }

  const roots = positions.filter((p) => !p.parent_id || !positionById.has(p.parent_id));
  for (const root of roots) visit(root);

  return { slotOf, leafCount: nextLeaf };
}

/** BFS depth of every descendant of `rootId` within `positions` (root itself excluded, depth 1 = direct child). */
function computeDepths(positions: OrgChartPosition[], rootId: string): Map<string, number> {
  const childrenByParentId = new Map<string, OrgChartPosition[]>();
  for (const p of positions) {
    if (!p.parent_id) continue;
    const list = childrenByParentId.get(p.parent_id);
    if (list) list.push(p);
    else childrenByParentId.set(p.parent_id, [p]);
  }
  const depthOf = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    for (const child of childrenByParentId.get(id) ?? []) {
      depthOf.set(child.id, depth + 1);
      queue.push({ id: child.id, depth: depth + 1 });
    }
  }
  return depthOf;
}

/**
 * The org-structure setup wizard's "second output" (2026-07-24): a
 * colorful, professional org-chart tree, complementing the plain editable
 * positions list already on this page and the staffing table on
 * `/admin/org-structure/staffing`. Root renders at the TOP, each level a
 * horizontal row below it (mirrored for RTL: a root's first-visited child
 * renders at the chart's RIGHT edge), siblings spread left-to-right within
 * their row via `computeSlots`.
 *
 * 2026-08-29: what used to render below a name-matched "branch container"
 * (isBranchContainer) is now driven entirely by real `org_structure_position_groups`
 * rows -- a group pulls SOME of one real parent's children (not necessarily
 * all) out of the shared grid and lays them out as their own branch,
 * 'horizontal' (fan-out, same mechanism as the old branch containers) or
 * 'vertical' (a single stacked column with a shared spine + individual
 * ticks). Groups nest freely (a group's own member can itself be the real
 * parent of another group -- e.g. "الإدارة التنفيذية لتطوير الأعمال"'s own
 * horizontal 3-way fan has two members that are each the parent of their own
 * small vertical group of two). `org_structure_functional_lines` renders as
 * a secondary dashed relationship line (elbow-shaped, never diagonal) between
 * two positions that otherwise share no `parent_id` edge at all.
 *
 * The whole tree (pyramid + every group) is auto-scaled to fit inside a
 * bounded viewport instead of letting the page grow indefinitely in either
 * direction. Manual +/- zoom and a "fit" reset are offered for anyone who
 * wants to read a compressed chart's fine print. Connector lines (drawn via
 * a measured SVG overlay, so real box heights/wrapping stay accurate)
 * always run as a clean elbow with no ambiguity about which position
 * reports to which parent — the same measurement pass draws lines for both
 * the pyramid and every group, since it only ever needs a position's own
 * rendered box, wherever that box ends up.
 */
export function OrgChartTree({
  positions,
  levels,
  groups,
  functionalLines,
  assigneesByPosition,
  jobTitleByPosition,
  emptyLabel,
  vacantLabel,
  zoomOutLabel,
  zoomInLabel,
  fitToScreenLabel,
}: {
  positions: OrgChartPosition[];
  levels: OrgChartLevel[];
  /** 2026-08-29: visual groupings, from org_structure_position_groups. */
  groups: OrgChartGroup[];
  /** 2026-08-29: dashed "functional relationship" lines, from org_structure_functional_lines. */
  functionalLines: OrgChartFunctionalLine[];
  assigneesByPosition: Record<string, string[]>;
  /** 2026-07-27: position id -> linked job_titles.name_ar, when set. */
  jobTitleByPosition: Record<string, string>;
  emptyLabel: string;
  vacantLabel: string;
  zoomOutLabel: string;
  zoomInLabel: string;
  fitToScreenLabel: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<ConnectorLine[]>([]);
  const [functionalLineLabels, setFunctionalLineLabels] = useState<FunctionalLineLabel[]>([]);
  const [fitScale, setFitScale] = useState(1);
  // null = automatic (always fit the viewport); a number = the user zoomed
  // manually, which also switches the wrapper to scroll instead of clip.
  const [manualScale, setManualScale] = useState<number | null>(null);
  const scale = manualScale ?? fitScale;

  const sortedLevels = useMemo(() => levels.slice().sort((a, b) => a.level_order - b.level_order), [levels]);

  const colorByLevelId = useMemo(
    () =>
      new Map<string, NodeColor>(
        sortedLevels.map((level, index) => [
          level.id,
          level.color ? { bg: level.color, fg: getContrastTextColor(level.color) } : THEME_NODE_COLORS[index % THEME_NODE_COLORS.length],
        ])
      ),
    [sortedLevels]
  );

  const positionById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const childrenByParentId = useMemo(() => {
    const map = new Map<string, OrgChartPosition[]>();
    for (const p of positions) {
      if (!p.parent_id) continue;
      const list = map.get(p.parent_id);
      if (list) list.push(p);
      else map.set(p.parent_id, [p]);
    }
    return map;
  }, [positions]);

  const membersByGroupId = useMemo(() => {
    const map = new Map<string, OrgChartPosition[]>();
    for (const p of positions) {
      if (!p.group_id) continue;
      const list = map.get(p.group_id);
      if (list) list.push(p);
      else map.set(p.group_id, [p]);
    }
    return map;
  }, [positions]);
  const groupsByParentId = useMemo(() => {
    const map = new Map<string, OrgChartGroup[]>();
    for (const g of groups) {
      const list = map.get(g.parent_id);
      if (list) list.push(g);
      else map.set(g.parent_id, [g]);
    }
    return map;
  }, [groups]);

  // Every group member, plus their entire real descendant chain (a group
  // member can itself be the real parent of a further group, or simply have
  // ordinary un-grouped children -- either way, once pulled out of the
  // shared grid nothing below it spills back in).
  const excludedFromMain = useMemo(() => {
    const excluded = new Set<string>();
    const queue: string[] = [];
    for (const p of positions) {
      if (p.group_id) {
        excluded.add(p.id);
        queue.push(p.id);
      }
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParentId.get(current) ?? []) {
        if (excluded.has(child.id)) continue; // guards a corrupted cyclical parent_id chain
        excluded.add(child.id);
        queue.push(child.id);
      }
    }
    return excluded;
  }, [positions, childrenByParentId]);
  const mainPositions = useMemo(() => positions.filter((p) => !excludedFromMain.has(p.id)), [positions, excludedFromMain]);

  // Row index per level (0 = root/level_order 1, increasing with depth) —
  // computed over the MAIN pyramid's own positions only, so a level that's
  // occupied exclusively by grouped content doesn't reserve an empty row.
  const rowIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => mainPositions.some((p) => p.level_id === l.id));
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, mainPositions]);
  const rowCount = Math.max(rowIndexByLevelId.size, 1);

  const { slotOf } = useMemo(() => computeSlots(mainPositions), [mainPositions]);

  // Every real descendant of `positionId` that was pulled out of the main
  // grid (i.e. via SOME group, at any depth) -- the "local subtree" a
  // group's own horizontal fan-out needs to lay out together. Mirrors the
  // old per-container branchSubtreeCache, just seeded from a position
  // rather than a name-matched container.
  function collectExcludedDescendants(rootId: string): OrgChartPosition[] {
    const result: OrgChartPosition[] = [];
    const queue = [...(childrenByParentId.get(rootId) ?? [])];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const p = queue.shift()!;
      if (seen.has(p.id) || !excludedFromMain.has(p.id)) continue;
      seen.add(p.id);
      result.push(p);
      for (const child of childrenByParentId.get(p.id) ?? []) queue.push(child);
    }
    return result;
  }

  // Total horizontal footprint a position's own grouped content needs,
  // recursively -- used to widen the main pyramid so a wide horizontal
  // group (or several groups sharing one parent, needing their own side-by-
  // side columns -- see GROUP_COLUMN_SPACING) never overlaps a neighbouring
  // column. A 'vertical' group only ever needs a single node's width plus
  // its spine gutter; a 'horizontal' group needs one BRANCH_SLOT_WIDTH per
  // real leaf in its own fan-out (recursing into any of ITS members that
  // are themselves further group parents). When MORE than one group shares
  // the same real parent (e.g. رئيس الجامعة's LEFT and RIGHT groups), each
  // gets its own GROUP_COLUMN_SPACING-wide column instead of summing their
  // raw widths, matching how `layoutGroups` below actually spaces them.
  function requiredWidthBelow(positionId: string): number {
    const anchoredGroups = groupsByParentId.get(positionId) ?? [];
    if (anchoredGroups.length === 0) return 0;
    const perGroupWidth = (group: OrgChartGroup): number => {
      if (group.layout === "vertical") {
        const members = membersByGroupId.get(group.id) ?? [];
        const memberWidth = BRANCH_NODE_WIDTH + VERTICAL_SPINE_GUTTER * 2;
        const nestedMax = Math.max(0, ...members.map((m) => requiredWidthBelow(m.id)));
        return Math.max(memberWidth, nestedMax);
      }
      const anchor = positionById.get(positionId);
      const members = membersByGroupId.get(group.id) ?? [];
      const subtree = anchor ? [anchor, ...members.flatMap((m) => [m, ...collectExcludedDescendants(m.id)])] : [];
      const { leafCount } = computeSlots(subtree);
      return Math.max(leafCount, 1) * BRANCH_SLOT_WIDTH;
    };
    if (anchoredGroups.length === 1) return perGroupWidth(anchoredGroups[0]);
    return Math.max(anchoredGroups.length * GROUP_COLUMN_SPACING, ...anchoredGroups.map(perGroupWidth));
  }

  const mainChildrenByParentId = useMemo(() => {
    const map = new Map<string, OrgChartPosition[]>();
    for (const p of mainPositions) {
      if (!p.parent_id) continue;
      const list = map.get(p.parent_id);
      if (list) list.push(p);
      else map.set(p.parent_id, [p]);
    }
    return map;
  }, [mainPositions]);

  // A position's own required group-width can't always be reserved on
  // ITSELF -- an internal node (e.g. رئيس الجامعة, which still has a real
  // main-pyramid child, نائب الرئيس) has no leaf slot of its own to widen.
  // Found live: رئيس's LEFT/RIGHT groups need lateral room, but were
  // silently ignored entirely since the old code only ever widened LEAVES.
  // Fix: any such requirement is instead split across the position's own
  // FIRST and LAST real leaf descendant (half on each), reserving room on
  // both sides of wherever that internal node's interpolated slot lands.
  function leafDescendantsOf(positionId: string): string[] {
    const result: string[] = [];
    const walk = (id: string) => {
      const children = mainChildrenByParentId.get(id) ?? [];
      if (children.length === 0) {
        result.push(id);
        return;
      }
      for (const child of children) walk(child.id);
    };
    walk(positionId);
    return result;
  }

  const { leafCenters, naturalWidth } = useMemo(() => {
    const leaves = mainPositions.filter((p) => !mainChildrenByParentId.has(p.id));
    const leavesInOrder = leaves.slice().sort((a, b) => (slotOf.get(a.id) ?? 0) - (slotOf.get(b.id) ?? 0));

    const extraWidthByLeafId = new Map<string, number>();
    const addExtra = (leafId: string, amount: number) => {
      extraWidthByLeafId.set(leafId, (extraWidthByLeafId.get(leafId) ?? 0) + amount);
    };
    for (const p of mainPositions) {
      const width = requiredWidthBelow(p.id);
      if (width <= 0) continue;
      if (!mainChildrenByParentId.has(p.id)) {
        addExtra(p.id, width);
        continue;
      }
      const descendants = leafDescendantsOf(p.id);
      if (descendants.length === 0) continue;
      addExtra(descendants[0], width / 2);
      addExtra(descendants[descendants.length - 1], width / 2);
    }

    const centers: number[] = [];
    let cursor = 0;
    for (const leaf of leavesInOrder) {
      const width = Math.max(SLOT_WIDTH, extraWidthByLeafId.get(leaf.id) ?? 0);
      centers.push(cursor + width / 2);
      cursor += width;
    }
    return { leafCenters: centers, naturalWidth: Math.max(cursor, SLOT_WIDTH) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainPositions, mainChildrenByParentId, slotOf, groupsByParentId, membersByGroupId, excludedFromMain]);

  // Continuous position for any slot value (leaves get an exact integer,
  // internal nodes get the fractional average of their children) —
  // interpolated between the two nearest leaf centers.
  function slotX(slot: number) {
    if (leafCenters.length === 0) return 0;
    const clamped = Math.min(Math.max(slot, 0), leafCenters.length - 1);
    const lower = Math.floor(clamped);
    const upper = Math.min(lower + 1, leafCenters.length - 1);
    const fraction = clamped - lower;
    return leafCenters[lower] + fraction * (leafCenters[upper] - leafCenters[lower]);
  }

  function slotLeft(slot: number) {
    // Mirrored for RTL: slot 0 (the first-visited child) renders at the
    // chart's right edge, matching this app's right-to-left reading flow.
    return naturalWidth - slotX(slot);
  }

  function rowTop(levelId: string) {
    const rowIndex = rowIndexByLevelId.get(levelId) ?? 0;
    return rowIndex * LEVEL_HEIGHT + LEVEL_HEIGHT / 2;
  }

  // Recursive per-group local layout: lays out one group's own members
  // relative to an already-known anchor position, then recurses into any
  // member that is itself the real parent of a further group (e.g. two of
  // "تطوير الأعمال"'s three horizontal-fan members each parent their own
  // small vertical group). Populates `byPositionId`/spine metadata as it
  // goes; `maxBottom` tracks the deepest point reached, for canvas height.
  function layoutGroups(
    parentId: string,
    anchor: { left: number; top: number; bottom: number },
    byPositionId: Map<string, { left: number; top: number }>,
    spines: Array<{ groupId: string; layout: "vertical"; columnLeft: number }>,
    state: { maxBottom: number }
  ) {
    const groupsHere = groupsByParentId.get(parentId) ?? [];
    groupsHere.forEach((group, groupIndex) => {
      const members = membersByGroupId.get(group.id) ?? [];
      if (members.length === 0) return;
      // When more than one group shares this exact parent (e.g. رئيس
      // الجامعة's LEFT and RIGHT groups), each gets its own column,
      // symmetric around the anchor's own position -- found live that
      // without this every group anchored at one parent rendered its
      // members at the identical (x, y), fully overlapping each other.
      const columnOffsetX = groupsHere.length > 1 ? (groupIndex - (groupsHere.length - 1) / 2) * GROUP_COLUMN_SPACING : 0;
      const columnLeft = anchor.left + columnOffsetX;

      if (group.layout === "vertical") {
        const firstRowY = anchor.bottom + VERTICAL_TOP_GAP + VERTICAL_ROW_HEIGHT / 2;
        members.forEach((member, index) => {
          const top = firstRowY + index * VERTICAL_ROW_HEIGHT;
          const pos = { left: columnLeft, top };
          byPositionId.set(member.id, pos);
          state.maxBottom = Math.max(state.maxBottom, top + VERTICAL_ROW_HEIGHT / 2);
          layoutGroups(member.id, { left: pos.left, top: pos.top, bottom: pos.top + VERTICAL_ROW_HEIGHT / 2 }, byPositionId, spines, state);
        });
        spines.push({ groupId: group.id, layout: "vertical", columnLeft });
      } else {
        const anchorPosition = positionById.get(parentId);
        if (!anchorPosition) return;
        const subtree = [anchorPosition, ...members.flatMap((m) => [m, ...collectExcludedDescendants(m.id)])];
        const { slotOf: localSlotOf } = computeSlots(subtree);
        const depthOf = computeDepths(subtree, parentId);
        const anchorLocalSlot = localSlotOf.get(parentId) ?? 0;
        const rowBottom = anchor.bottom;

        for (const p of subtree) {
          if (p.id === parentId) continue;
          const localSlot = localSlotOf.get(p.id) ?? 0;
          const depth = depthOf.get(p.id) ?? 1;
          const left = columnLeft - (localSlot - anchorLocalSlot) * BRANCH_SLOT_WIDTH;
          const top = rowBottom + BRANCH_TOP_GAP + (depth - 1) * BRANCH_ROW_HEIGHT + BRANCH_ROW_HEIGHT / 2;
          byPositionId.set(p.id, { left, top });
          state.maxBottom = Math.max(state.maxBottom, top + BRANCH_ROW_HEIGHT / 2);
        }
        // Recurse into any direct member that itself parents a further
        // group (nested groups deeper than one member are laid out when
        // THAT member's own turn comes below, via its own byPositionId entry).
        for (const member of members) {
          const memberPos = byPositionId.get(member.id);
          if (!memberPos) continue;
          layoutGroups(
            member.id,
            { left: memberPos.left, top: memberPos.top, bottom: memberPos.top + BRANCH_ROW_HEIGHT / 2 },
            byPositionId,
            spines,
            state
          );
        }
      }
    });
  }

  const groupLayout = useMemo(() => {
    const byPositionId = new Map<string, { left: number; top: number }>();
    const spines: Array<{ groupId: string; layout: "vertical"; columnLeft: number }> = [];
    const state = { maxBottom: 0 };
    for (const p of mainPositions) {
      const slot = slotOf.get(p.id) ?? 0;
      const left = slotLeft(slot);
      const top = rowTop(p.level_id);
      layoutGroups(p.id, { left, top, bottom: top + LEVEL_HEIGHT / 4 }, byPositionId, spines, state);
    }
    return { byPositionId, spines, maxBottom: state.maxBottom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainPositions, slotOf, leafCenters, naturalWidth, groupsByParentId, membersByGroupId, rowIndexByLevelId]);

  // Natural (unscaled) canvas HEIGHT — accounts for the tallest group content,
  // which can extend past the main pyramid's own deepest row.
  const naturalHeight = Math.max(rowCount * LEVEL_HEIGHT, groupLayout.maxBottom + LEVEL_HEIGHT / 4);

  // Auto-fit: recompute whenever the data shape changes or the viewport
  // itself resizes (window resize, sidebar toggle, ...). Deliberately does
  // NOT depend on `scale` itself — it only ever WRITES to `fitScale`, never
  // reads it, so there is no feedback loop to guard against here.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const updateFitScale = () => {
      const { clientWidth, clientHeight } = wrapper;
      if (clientWidth === 0 || clientHeight === 0) return;
      const next = Math.min(1, clientWidth / naturalWidth, clientHeight / naturalHeight);
      setFitScale(Math.max(MIN_SCALE, next));
    };
    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [naturalWidth, naturalHeight]);

  // Connector lines: measured from the real rendered boxes (so text-wrap-
  // driven height differences stay accurate), then converted from on-screen
  // pixels back to the canvas's own unscaled local coordinate system by
  // dividing out the current `scale`. Runs over the FULL `positions` list,
  // so group connectors come for free -- this loop only ever needs a
  // position's registered element and its parent's, wherever either ended
  // up. A 'vertical' group member's own generic parent-line is suppressed
  // here (its tick is drawn separately via `groupLayout.spines` instead,
  // sharing one spine per group rather than one full elbow per member).
  const verticalGroupMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      if (g.layout !== "vertical") continue;
      for (const m of membersByGroupId.get(g.id) ?? []) ids.add(m.id);
    }
    return ids;
  }, [groups, membersByGroupId]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const toLocalX = (clientX: number) => (clientX - canvasRect.left) / scale;
      const toLocalY = (clientY: number) => (clientY - canvasRect.top) / scale;

      const nextLines: ConnectorLine[] = [];
      for (const p of positions) {
        if (!p.parent_id || verticalGroupMemberIds.has(p.id)) continue;
        const parent = positionById.get(p.parent_id);
        const childEl = nodeElsRef.current.get(p.id);
        const parentEl = nodeElsRef.current.get(p.parent_id);
        if (!parent || !childEl || !parentEl) continue;
        const childRect = childEl.getBoundingClientRect();
        const parentRect = parentEl.getBoundingClientRect();
        // Classic top-down elbow: leaves the parent's BOTTOM edge, arrives
        // at the child's TOP edge, split at the midpoint row between them.
        const x1 = toLocalX(parentRect.left + parentRect.width / 2);
        const y1 = toLocalY(parentRect.bottom);
        const x2 = toLocalX(childRect.left + childRect.width / 2);
        const y2 = toLocalY(childRect.top);
        const midY = (y1 + y2) / 2;
        nextLines.push({ id: p.id, d: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}` });
      }

      // Vertical-group spines: one shared stem+spine per group, plus a short
      // independent tick into each member's edge -- not one line per member,
      // which would read as a chain rather than "these all report to the
      // same real parent". Spine sits VERTICAL_SPINE_GUTTER to one side of
      // the node column, ticks run horizontally into the member's near edge.
      for (const spine of groupLayout.spines) {
        const members = membersByGroupId.get(spine.groupId) ?? [];
        if (members.length === 0) continue;
        const stemFromEl = nodeElsRef.current.get(members[0].parent_id ?? "");
        if (!stemFromEl) continue;
        const stemRect = stemFromEl.getBoundingClientRect();
        const stemX = toLocalX(stemRect.left + stemRect.width / 2);
        const stemY = toLocalY(stemRect.bottom);
        // Spine sits beside THIS group's own column (not just an offset from
        // the shared parent's center) -- when several groups share one
        // parent, each has its own columnLeft already spaced apart by
        // GROUP_COLUMN_SPACING during layout; using that here (rather than
        // re-deriving a fixed offset from the parent's own center) keeps the
        // spine aligned with where this group's members actually rendered.
        const spineX = spine.columnLeft + VERTICAL_SPINE_GUTTER;
        const topY = stemY + VERTICAL_TOP_GAP;
        nextLines.push({ id: `${spine.groupId}-stem`, d: `M ${stemX} ${stemY} L ${stemX} ${topY} L ${spineX} ${topY}` });
        let bottomY = topY;
        for (const member of members) {
          const el = nodeElsRef.current.get(member.id);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const y = toLocalY(rect.top + rect.height / 2);
          bottomY = y;
          const memberEdgeX = toLocalX(rect.left + rect.width);
          nextLines.push({ id: `${spine.groupId}-tick-${member.id}`, d: `M ${spineX} ${y} L ${memberEdgeX} ${y}` });
        }
        nextLines.push({ id: `${spine.groupId}-spine`, d: `M ${spineX} ${topY} L ${spineX} ${bottomY}` });
      }

      // Dashed functional (non-reporting) relationship lines: same elbow
      // shape as a solid line, but direction-aware (either box can be above
      // the other) and always vertical-then-horizontal-then-vertical, never
      // diagonal -- direct follow-up request after the first version drew a
      // raw straight line between the two box centers.
      const nextLabels: FunctionalLineLabel[] = [];
      for (const fl of functionalLines) {
        const fromEl = nodeElsRef.current.get(fl.from_position_id);
        const toEl = nodeElsRef.current.get(fl.to_position_id);
        if (!fromEl || !toEl) continue;
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const fromCenterY = fromRect.top + fromRect.height / 2;
        const toCenterY = toRect.top + toRect.height / 2;
        const fromBelow = fromCenterY > toCenterY;
        const x1 = toLocalX(fromRect.left + fromRect.width / 2);
        const x2 = toLocalX(toRect.left + toRect.width / 2);
        const y1 = toLocalY(fromBelow ? fromRect.top : fromRect.bottom);
        const y2 = toLocalY(fromBelow ? toRect.bottom : toRect.top);
        const midY = (y1 + y2) / 2;
        nextLines.push({ id: `fl-${fl.id}`, d: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`, dashed: true });
        if (fl.label_ar) {
          nextLabels.push({ id: fl.id, x: (x1 + x2) / 2, y: midY, text: fl.label_ar });
        }
      }

      setLines(nextLines);
      setFunctionalLineLabels(nextLabels);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, levels, scale, groupLayout, functionalLines, verticalGroupMemberIds]);

  if (positions.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{emptyLabel}</p>;
  }

  // Functional updater form (reading `prev`, not the closed-over `scale`)
  // so rapid successive clicks accumulate correctly.
  const zoomIn = () =>
    setManualScale((prev) => Math.min(MAX_SCALE, Number(((prev ?? fitScale) + ZOOM_STEP).toFixed(2))));
  const zoomOut = () =>
    setManualScale((prev) => Math.max(MIN_SCALE, Number(((prev ?? fitScale) - ZOOM_STEP).toFixed(2))));
  const resetToFit = () => setManualScale(null);
  const isManualZoom = manualScale !== null;

  function nodeContent(p: OrgChartPosition) {
    const assignees = assigneesByPosition[p.id] ?? [];
    const jobTitle = jobTitleByPosition[p.id];
    return (
      <>
        <strong>{p.name_ar}</strong>
        {/* Not the shared `.sru-name-en`: that one is muted grey and
            end-aligned, both wrong on a filled, centred node — this
            inherits the node's own text colour like the two lines
            below it already do. */}
        {p.name_en && <span className="sru-orgchart-node-nameen">{p.name_en}</span>}
        {jobTitle && (
          <span className="sru-orgchart-node-jobtitle">
            <Briefcase size={11} />
            {jobTitle}
          </span>
        )}
        <span className="sru-orgchart-node-assignees">
          <Users size={12} />
          {assignees.length > 0 ? assignees.join("، ") : vacantLabel}
        </span>
      </>
    );
  }

  return (
    <div>
      <div className="sru-orgchart-zoombar">
        <button type="button" className="sru-icon-action" onClick={zoomOut} aria-label={zoomOutLabel} title={zoomOutLabel}>
          <Minus size={14} />
        </button>
        <span className="sru-orgchart-zoomlevel">{Math.round(scale * 100)}%</span>
        <button type="button" className="sru-icon-action" onClick={zoomIn} aria-label={zoomInLabel} title={zoomInLabel}>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="sru-icon-action"
          onClick={resetToFit}
          disabled={!isManualZoom}
          aria-label={fitToScreenLabel}
          title={fitToScreenLabel}
        >
          <Scan size={14} />
        </button>
      </div>
      <div ref={wrapperRef} className="sru-orgchart-wrapper">
        <div className="sru-orgchart-scalebox" style={{ width: naturalWidth * scale, height: naturalHeight * scale }}>
          <div
            ref={canvasRef}
            className="sru-orgchart-canvas"
            style={{ width: naturalWidth, height: naturalHeight, transform: `scale(${scale})` }}
          >
            <svg className="sru-orgchart-lines">
              {lines.map((line) => (
                <path
                  key={line.id}
                  d={line.d}
                  fill="none"
                  stroke="var(--sru-border)"
                  strokeWidth={2}
                  strokeDasharray={line.dashed ? "5 4" : undefined}
                />
              ))}
              {functionalLineLabels.map((label) => (
                <text key={label.id} x={label.x} y={label.y - 4} textAnchor="middle" className="sru-orgchart-functional-label">
                  {label.text}
                </text>
              ))}
            </svg>
            {mainPositions.map((p) => {
              const slot = slotOf.get(p.id) ?? 0;
              const color = colorByLevelId.get(p.level_id)!;
              const override = p.color ? { background: p.color, color: getContrastTextColor(p.color) } : { background: color.bg, color: color.fg };
              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) nodeElsRef.current.set(p.id, el);
                    else nodeElsRef.current.delete(p.id);
                  }}
                  className="sru-orgchart-node"
                  style={{
                    position: "absolute",
                    left: slotLeft(slot),
                    top: rowTop(p.level_id),
                    transform: "translate(-50%, -50%)",
                    ...override,
                  }}
                >
                  {nodeContent(p)}
                </div>
              );
            })}
            {positions
              .filter((p) => excludedFromMain.has(p.id))
              .map((p) => {
                const pos = groupLayout.byPositionId.get(p.id);
                if (!pos) return null;
                const overrideStyle = p.color ? { background: p.color, color: getContrastTextColor(p.color), border: "none" } : undefined;
                return (
                  <div
                    key={p.id}
                    ref={(el) => {
                      if (el) nodeElsRef.current.set(p.id, el);
                      else nodeElsRef.current.delete(p.id);
                    }}
                    className="sru-orgchart-node sru-orgchart-node-branch"
                    style={{
                      position: "absolute",
                      left: pos.left,
                      top: pos.top,
                      transform: "translate(-50%, -50%)",
                      ...overrideStyle,
                    }}
                  >
                    {nodeContent(p)}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
