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
}

interface OrgChartLevel {
  id: string;
  level_order: number;
  /** Admin override hex (2026-07-25); NULL falls back to the theme rotation below. */
  color: string | null;
}

interface NodeColor {
  bg: string;
  fg: string;
}

interface ConnectorLine {
  id: string;
  d: string;
}

// 2026-08-28: rebuilt from the column-per-level (vertical) layout back to
// the classic top-down pyramid (root at top, each level a horizontal row
// below it) -- direct request for a "hierarchical, screen-sized" chart.
// Auto-fit scaling (below) fixes the recurring overflow complaints this
// component has been rebuilt twice to chase on a single axis at a time.
const SLOT_WIDTH = 226; // horizontal spacing per sibling slot in the main pyramid -- node width (190px) is set in globals.css
const LEVEL_HEIGHT = 188; // vertical spacing per depth row in the main pyramid
const MIN_SCALE = 0.28;
const MAX_SCALE = 2;
const ZOOM_STEP = 0.18;

// 2026-08-28 follow-up: "لماذا لا تفعل مثل اللي كان في الصورة بحيث يكون
// اللي تحت الادارة التنفيذية وتحت النائب المساعد بشكل رأسي" -- the official
// chart draws everything under an "الإدارة التنفيذية ..." / "النائب المساعد
// ..." box as its own compact VERTICAL sub-list (still boxes-and-lines, just
// stacked downward instead of sharing the main pyramid's horizontal rank
// rows), not spread across the shared grid. A node matching either prefix
// is a "branch container": it still occupies its own normal slot in the
// main pyramid, but everything BELOW it is excluded from the shared
// computeSlots/rank-row layout and instead laid out by a second, smaller
// application of the exact same slot algorithm, scoped to just that
// container's own subtree, anchored directly beneath it. This is why
// `computeSlots` takes an arbitrary position list rather than the full
// tree -- it was already reusable for this before today.
function isBranchContainer(nameAr: string): boolean {
  return nameAr.startsWith("الإدارة التنفيذية") || nameAr.startsWith("النائب المساعد");
}

// 2026-08-28, second pass: "ما تحت الادارة التنفيذية للخدمات المشتركة
// والادارة التنفيذية لتقنية المعلومات والادارة التنفيذية لتطوير الاعمال
// تكون رأسية" -- the first version of the branch list spread SIBLINGS
// horizontally (a small mini-pyramid via computeSlots), which is wrong for
// a container with several FLAT children and no further nesting (e.g. the
// 6 plain departments under "الخدمات المشتركة"): that case rendered as a
// wide ROW, not a vertical list, defeating the whole point. A branch list
// is now a genuine single column: every descendant gets its own
// sequential row in depth-first order (so N flat siblings become N
// stacked rows, not N side-by-side ones), with only a small per-depth
// indent to show real nesting (e.g. "مركز التدريب" under "إدارة التدريب
// والاستشارات") -- not a second horizontal spread.
// 2026-08-28, third pass: a fixed BRANCH_ROW_HEIGHT (46px) overlapped real
// branch nodes live -- their actual rendered height varies with how much
// name_ar/name_en/job title/assignees text wraps at the branch tier's
// narrower 152px width (a real production node reached 105px, more than
// double the guessed constant), so several stacked siblings collided.
// Fixed the same way this component already treats connector lines: each
// row's real DOM height is measured (see the effect below) instead of
// assumed, and rows stack via a running cumulative offset.
const BRANCH_ROW_GAP = 10; // vertical gap between successive rows in one branch's own vertical list
const BRANCH_ROW_HEIGHT_FALLBACK = 92; // used only until a branch item's real height is measured (first paint)
const BRANCH_INDENT = 22; // horizontal shift per nesting depth within a branch (small -- this is a list, not a second pyramid)
const BRANCH_TOP_GAP = 26; // gap between a container's own row band and its branch list's first row

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
 * slots even when they'd otherwise render at the same tree depth — the fix
 * for the 2026-07-25 report ("مدير رأس المال البشري يتبع مباشرة الرئيس
 * التنفيذي وليس نائب الرئيس"): two of CEO's children coincidentally shared
 * one slot before this existed. Orientation-agnostic and scope-agnostic: it
 * only ever looks at the positions it's given, treating anything whose
 * parent isn't IN that list as a root of its own — which is exactly what
 * lets the branch-list layout below reuse it unchanged on a small subtree.
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

/**
 * Lays out one branch container's real subtree as a plain vertical list:
 * a depth-first walk visiting every descendant, each getting its own
 * sequential row (so several flat siblings become several stacked rows,
 * never a side-by-side spread), with a small per-depth horizontal indent
 * to show real nesting -- the fix for the first version's mistake of
 * spreading siblings horizontally like a second, smaller pyramid.
 */
function layoutBranchList(subtree: OrgChartPosition[], containerId: string): Map<string, { rowIndex: number; depth: number }> {
  const childrenByParentId = new Map<string, OrgChartPosition[]>();
  for (const p of subtree) {
    if (!p.parent_id) continue;
    const list = childrenByParentId.get(p.parent_id);
    if (list) list.push(p);
    else childrenByParentId.set(p.parent_id, [p]);
  }
  const result = new Map<string, { rowIndex: number; depth: number }>();
  let nextRow = 0;
  function visit(nodeId: string, depth: number) {
    for (const child of childrenByParentId.get(nodeId) ?? []) {
      result.set(child.id, { rowIndex: nextRow, depth });
      nextRow += 1;
      visit(child.id, depth + 1);
    }
  }
  visit(containerId, 1);
  return result;
}

/**
 * The org-structure setup wizard's "second output" (2026-07-24): a
 * colorful, professional org-chart tree, complementing the plain editable
 * positions list already on this page and the staffing table on
 * `/admin/org-structure/staffing`. Root renders at the TOP, each level a
 * horizontal row below it (mirrored for RTL: a root's first-visited child
 * renders at the chart's RIGHT edge), siblings spread left-to-right within
 * their row via `computeSlots`. Below any "branch container" (an
 * الإدارة التنفيذية/النائب المساعد position), everything is laid out again
 * by `layoutBranchList` as a plain vertical LIST instead — a depth-first
 * walk giving every descendant its own stacked row (so several flat
 * siblings become several stacked rows, never a side-by-side spread) with
 * only a small per-depth indent for real nesting — matching the official
 * chart's own convention of drawing department-level detail as a simple
 * stack rather than forcing it into the main pyramid's shared rank rows.
 * The whole tree (pyramid + every branch list) is auto-scaled to fit inside a
 * bounded viewport instead of letting the page grow indefinitely in either
 * direction. Manual +/- zoom and a "fit" reset are offered for anyone who
 * wants to read a compressed chart's fine print. Connector lines (drawn via
 * a measured SVG overlay, so real box heights/wrapping stay accurate)
 * always run as a clean elbow with no ambiguity about which position
 * reports to which parent — the same measurement pass draws lines for both
 * the pyramid and every branch list, since it only ever needs a
 * position's own rendered box, wherever that box ends up.
 */
export function OrgChartTree({
  positions,
  levels,
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
  const [fitScale, setFitScale] = useState(1);
  // null = automatic (always fit the viewport); a number = the user zoomed
  // manually, which also switches the wrapper to scroll instead of clip.
  const [manualScale, setManualScale] = useState<number | null>(null);
  const scale = manualScale ?? fitScale;
  // Real (unscaled) rendered height per branch-list item, keyed by position
  // id -- filled in by the measurement effect below.
  const [branchNodeHeights, setBranchNodeHeights] = useState<Map<string, number>>(new Map());

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

  // Branch containers and what falls under them: excluded from the main
  // pyramid's own slot/row computation entirely (the container itself stays
  // in — only its descendants are pulled out), then laid out again locally.
  const branchContainers = useMemo(() => positions.filter((p) => isBranchContainer(p.name_ar)), [positions]);
  const excludedFromMain = useMemo(() => {
    const childrenByParentId = new Map<string, OrgChartPosition[]>();
    for (const p of positions) {
      if (!p.parent_id) continue;
      const list = childrenByParentId.get(p.parent_id);
      if (list) list.push(p);
      else childrenByParentId.set(p.parent_id, [p]);
    }
    const excluded = new Set<string>();
    for (const container of branchContainers) {
      const queue = [container.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const child of childrenByParentId.get(current) ?? []) {
          if (excluded.has(child.id)) continue; // guards a corrupted cyclical parent_id chain
          excluded.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return excluded;
  }, [positions, branchContainers]);
  const mainPositions = useMemo(() => positions.filter((p) => !excludedFromMain.has(p.id)), [positions, excludedFromMain]);

  // Row index per level (0 = root/level_order 1, increasing with depth) —
  // computed over the MAIN pyramid's own positions only, so a level that's
  // occupied exclusively by branch-list content doesn't reserve an empty row.
  const rowIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => mainPositions.some((p) => p.level_id === l.id));
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, mainPositions]);
  const rowCount = Math.max(rowIndexByLevelId.size, 1);

  const { slotOf, leafCount } = useMemo(() => computeSlots(mainPositions), [mainPositions]);

  // Natural (unscaled) canvas width — a branch list only ever needs a
  // small per-depth indent now (see `layoutBranchList`), never a wide
  // fan-out, so the main pyramid's own fixed per-slot spacing is enough on
  // its own (unlike the first version of this feature, which spread a
  // branch's siblings horizontally and needed a much more involved
  // variable-width scheme to avoid adjacent branches colliding).
  const naturalWidth = Math.max(leafCount, 1) * SLOT_WIDTH;

  function slotLeft(slot: number) {
    // Mirrored for RTL: slot 0 (the first-visited child) renders at the
    // chart's right edge, matching this app's right-to-left reading flow.
    return (Math.max(leafCount, 1) - 1 - slot) * SLOT_WIDTH + SLOT_WIDTH / 2;
  }

  function rowTop(levelId: string) {
    const rowIndex = rowIndexByLevelId.get(levelId) ?? 0;
    return rowIndex * LEVEL_HEIGHT + LEVEL_HEIGHT / 2;
  }

  const branchSubtreeCache = useMemo(() => {
    const cache = new Map<string, OrgChartPosition[]>();
    for (const container of branchContainers) {
      cache.set(
        container.id,
        positions.filter((p) => p.id === container.id || (excludedFromMain.has(p.id) && isDescendantOf(positions, p.id, container.id)))
      );
    }
    return cache;
  }, [branchContainers, positions, excludedFromMain]);

  // Per-branch-container local layout: its own descendants, positioned
  // relative to the container's own already-known main-pyramid coordinates.
  const branchLayout = useMemo(() => {
    const byPositionId = new Map<string, { left: number; top: number }>();
    let maxBranchBottom = 0;
    for (const container of branchContainers) {
      const containerSlot = slotOf.get(container.id) ?? 0;
      const containerLeft = slotLeft(containerSlot);
      const containerRowBottom = rowTop(container.level_id) + LEVEL_HEIGHT / 2;

      const subtree = branchSubtreeCache.get(container.id) ?? [container];
      const rows = layoutBranchList(subtree, container.id);
      // Sorted by rowIndex so the running cumulative offset below advances
      // in the same depth-first order layoutBranchList assigned.
      const orderedRows = Array.from(rows.entries()).sort((a, b) => a[1].rowIndex - b[1].rowIndex);

      let cursorTop = containerRowBottom + BRANCH_TOP_GAP;
      for (const [positionId, { depth }] of orderedRows) {
        // Indent GROWS with depth, matching how the main pyramid already
        // treats "deeper" as "further left" — real nesting stays visually
        // distinct without turning this list back into a second pyramid.
        const left = containerLeft - depth * BRANCH_INDENT;
        const height = branchNodeHeights.get(positionId) ?? BRANCH_ROW_HEIGHT_FALLBACK;
        const top = cursorTop + height / 2;
        byPositionId.set(positionId, { left, top });
        cursorTop += height + BRANCH_ROW_GAP;
        maxBranchBottom = Math.max(maxBranchBottom, cursorTop);
      }
    }
    return { byPositionId, maxBranchBottom };
    // `rowTop`/`slotLeft` are plain functions of state already listed here
    // (`rowIndexByLevelId`, `slotOf`/`leafCount`) — they're recreated every
    // render, so listing them too would just make this memo pointless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContainers, branchSubtreeCache, slotOf, leafCount, rowIndexByLevelId, branchNodeHeights]);

  // Branch-list row heights are MEASURED, not guessed -- mirrors the
  // connector-line effect's own "read the real box" approach just below.
  // Runs after every commit; only actually updates state (and therefore
  // triggers a second layout pass) when a measured height genuinely
  // differs, so this converges in at most one extra render: `offsetHeight`
  // depends on a node's fixed 152px width and its text content, neither of
  // which changes when `branchLayout` recomputes `top` from a new height.
  useLayoutEffect(() => {
    // Named + invoked, matching the connector-line effect just below — this
    // measure-then-conditionally-update shape is what useLayoutEffect
    // exists for, but the project's lint rule only recognizes it once the
    // setState call is inside its own named function rather than the
    // effect's top-level body.
    const measure = () => {
      if (excludedFromMain.size === 0) return;
      let changed = branchNodeHeights.size !== excludedFromMain.size;
      const next = new Map<string, number>();
      for (const id of excludedFromMain) {
        const el = nodeElsRef.current.get(id);
        const height = el ? el.offsetHeight : branchNodeHeights.get(id) ?? BRANCH_ROW_HEIGHT_FALLBACK;
        next.set(id, height);
        if (branchNodeHeights.get(id) !== height) changed = true;
      }
      if (changed) setBranchNodeHeights(next);
    };
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludedFromMain, branchLayout]);

  // Natural (unscaled) canvas HEIGHT. Also accounts for the tallest branch
  // list, which can extend past the main pyramid's own deepest row.
  const naturalHeight = Math.max(rowCount * LEVEL_HEIGHT, branchLayout.maxBranchBottom + LEVEL_HEIGHT / 4);

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
  // dividing out the current `scale` — the canvas is visually scaled via a
  // CSS transform, but its children's `left`/`top` styles (and therefore
  // this SVG's own coordinate space) are always expressed pre-scale. Runs
  // over the FULL `positions` list (not just the main pyramid's own), so
  // branch-list connectors come for free — this loop only ever needs a
  // position's registered element and its parent's, regardless of which
  // layout placed either of them.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const nextLines: ConnectorLine[] = [];
      for (const p of positions) {
        if (!p.parent_id) continue;
        const parent = positionById.get(p.parent_id);
        const childEl = nodeElsRef.current.get(p.id);
        const parentEl = nodeElsRef.current.get(p.parent_id);
        if (!parent || !childEl || !parentEl) continue;
        const childRect = childEl.getBoundingClientRect();
        const parentRect = parentEl.getBoundingClientRect();
        const toLocalX = (clientX: number) => (clientX - canvasRect.left) / scale;
        const toLocalY = (clientY: number) => (clientY - canvasRect.top) / scale;
        // Classic top-down elbow: leaves the parent's BOTTOM edge, arrives
        // at the child's TOP edge, split at the midpoint row between them.
        const x1 = toLocalX(parentRect.left + parentRect.width / 2);
        const y1 = toLocalY(parentRect.bottom);
        const x2 = toLocalX(childRect.left + childRect.width / 2);
        const y2 = toLocalY(childRect.top);
        const midY = (y1 + y2) / 2;
        nextLines.push({ id: p.id, d: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}` });
      }
      setLines(nextLines);
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
  }, [positions, levels, scale, branchLayout]);

  if (positions.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{emptyLabel}</p>;
  }

  // Functional updater form (reading `prev`, not the closed-over `scale`)
  // so rapid successive clicks accumulate correctly -- found live while
  // verifying: three quick zoom-in clicks all computed off the SAME
  // pre-click `scale` before React had a chance to re-render between them,
  // so only one step's worth of zoom ever landed no matter how many clicks.
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
                <path key={line.id} d={line.d} fill="none" stroke="var(--sru-border)" strokeWidth={2} />
              ))}
            </svg>
            {mainPositions.map((p) => {
              const slot = slotOf.get(p.id) ?? 0;
              const color = colorByLevelId.get(p.level_id)!;
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
                    background: color.bg,
                    color: color.fg,
                  }}
                >
                  {nodeContent(p)}
                </div>
              );
            })}
            {positions
              .filter((p) => excludedFromMain.has(p.id))
              .map((p) => {
                const pos = branchLayout.byPositionId.get(p.id);
                if (!pos) return null;
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

/** Whether `id` is a real descendant of `rootId` within `positions` (walks parent_id upward). */
function isDescendantOf(positions: OrgChartPosition[], id: string, rootId: string): boolean {
  const byId = new Map(positions.map((p) => [p.id, p]));
  let current: string | null = id;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) return false; // guards a corrupted cyclical parent_id chain
    visited.add(current);
    const p: OrgChartPosition | undefined = byId.get(current);
    if (!p || !p.parent_id) return false;
    if (p.parent_id === rootId) return true;
    current = p.parent_id;
  }
  return false;
}
