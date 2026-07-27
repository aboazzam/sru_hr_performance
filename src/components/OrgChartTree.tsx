"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Users } from "lucide-react";
import { getContrastTextColor } from "@/lib/color";

interface OrgChartPosition {
  id: string;
  parent_id: string | null;
  level_id: string;
  name_ar: string;
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

// 2026-07-27: rebuilt from a row-per-level (horizontal) layout to a
// column-per-level (vertical) one -- real feedback: a level with many
// positions (e.g. C4) spread the whole chart out horizontally far enough
// that "a worker can't see the chart" without heavy horizontal scrolling.
// Siblings now stack vertically within their own level's column instead,
// so canvas WIDTH only grows with tree DEPTH (level count), not breadth --
// a wide level just makes the chart taller, which scrolls far more
// naturally on a normal page than horizontal overflow does.
const SLOT_HEIGHT = 132;
const LEVEL_WIDTH = 260;

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
 * one slot before this existed. This slot value now drives VERTICAL
 * position (each level is a column, siblings stack top-to-bottom) rather
 * than horizontal, per the 2026-07-27 layout rebuild below, but the
 * algorithm itself is orientation-agnostic and unchanged.
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
 * The org-structure setup wizard's "second output" (2026-07-24): a
 * colorful, professional org-chart tree, complementing the plain editable
 * positions list already on this page and the staffing table on
 * `/admin/org-structure/staffing`. Every position renders in the COLUMN
 * belonging to its own level (not its tree depth), root on the right,
 * depth increasing to the left (RTL flow) — rebuilt 2026-07-27 from an
 * earlier row-per-level layout (see the CSS comment in globals.css for that
 * history) after real feedback that a level with many positions (e.g. C4)
 * stretched the whole chart out horizontally far enough to be unreadable
 * without heavy scrolling. Siblings now stack vertically within their own
 * level's column instead via `computeSlots` (unchanged tree-layout pass,
 * now driving vertical position) — a wide level just makes the chart
 * taller, which a normal page scrolls far more gracefully than horizontal
 * overflow. Connector lines (drawn via a measured SVG overlay, so real box
 * heights/wrapping stay accurate) always run as a clean elbow with no
 * ambiguity about which position reports to which parent.
 */
export function OrgChartTree({
  positions,
  levels,
  assigneesByPosition,
  jobTitleByPosition,
  emptyLabel,
  vacantLabel,
}: {
  positions: OrgChartPosition[];
  levels: OrgChartLevel[];
  assigneesByPosition: Record<string, string[]>;
  /** 2026-07-27: position id -> linked job_titles.name_ar, when set. */
  jobTitleByPosition: Record<string, string>;
  emptyLabel: string;
  vacantLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<ConnectorLine[]>([]);

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

  // Column index per level (0 = root/level_order 1, increasing with depth).
  // Physical x is assigned in reverse below so the root renders at the
  // RIGHT edge of the canvas and depth grows to the left -- matching this
  // app's RTL reading direction instead of a raw LTR pixel layout.
  const columnIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => positions.some((p) => p.level_id === l.id));
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, positions]);
  const columnCount = Math.max(columnIndexByLevelId.size, 1);

  const { slotOf, leafCount } = useMemo(() => computeSlots(positions), [positions]);

  const canvasWidth = columnCount * LEVEL_WIDTH;
  const canvasHeight = Math.max(leafCount, 1) * SLOT_HEIGHT;

  function columnLeft(levelId: string) {
    const columnIndex = columnIndexByLevelId.get(levelId) ?? 0;
    return (columnCount - 1 - columnIndex) * LEVEL_WIDTH;
  }

  const measure = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nextLines: ConnectorLine[] = [];
    for (const p of positions) {
      if (!p.parent_id) continue;
      const parent = positionById.get(p.parent_id);
      const childEl = nodeElsRef.current.get(p.id);
      const parentEl = nodeElsRef.current.get(p.parent_id);
      if (!parent || !childEl || !parentEl) continue;
      const childRect = childEl.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();
      // Root renders on the right, children to its left (RTL flow), so a
      // connector leaves the parent's LEFT edge and arrives at the child's
      // RIGHT edge -- the transposed equivalent of the old top-to-bottom
      // elbow, still a single mid-point-split elbow regardless of how many
      // columns a skip-level link spans.
      const x1 = parentRect.left - containerRect.left;
      const y1 = parentRect.top + parentRect.height / 2 - containerRect.top;
      const x2 = childRect.right - containerRect.left;
      const y2 = childRect.top + childRect.height / 2 - containerRect.top;
      const midX = (x1 + x2) / 2;
      nextLines.push({ id: p.id, d: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}` });
    }
    setLines(nextLines);
  };

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Re-measure whenever the actual data changes shape; `measure` itself is
    // stable in spirit (recreated each render) but not a dependency here to
    // avoid dropping the resize/observer setup on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, levels]);

  if (positions.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{emptyLabel}</p>;
  }

  return (
    <div ref={containerRef} className="sru-orgchart-wrapper">
      <div className="sru-orgchart-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="sru-orgchart-lines">
          {lines.map((line) => (
            <path key={line.id} d={line.d} fill="none" stroke="var(--sru-border)" strokeWidth={2} />
          ))}
        </svg>
        {positions.map((p) => {
          const slot = slotOf.get(p.id) ?? 0;
          const color = colorByLevelId.get(p.level_id)!;
          const assignees = assigneesByPosition[p.id] ?? [];
          const jobTitle = jobTitleByPosition[p.id];
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
                left: columnLeft(p.level_id) + LEVEL_WIDTH / 2,
                top: slot * SLOT_HEIGHT + SLOT_HEIGHT / 2,
                transform: "translate(-50%, -50%)",
                background: color.bg,
                color: color.fg,
              }}
            >
              <strong>{p.name_ar}</strong>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
