"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
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

const SLOT_WIDTH = 200;
const ROW_HEIGHT = 96;

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
 * Assigns every position a horizontal "slot" via a classic tree-layout
 * leaf-ordering pass: each LEAF gets the next sequential slot in traversal
 * order, and each internal node's slot is the average of its own children's
 * slots. Two positions that don't share a subtree end up in genuinely
 * different horizontal columns even when they happen to render on adjacent
 * or distant rows — the actual fix for the 2026-07-25 report ("مدير رأس
 * المال البشري يتبع مباشرة الرئيس التنفيذي وليس نائب الرئيس"): a straight
 * bypass curve around the intervening row still read as ambiguous, because
 * both positions sat in the exact same horizontal column by coincidence
 * (each alone in its own row). Giving CEO's two independent children (one
 * at C2, one at C4) distinct slots means the CEO node naturally centers
 * between them, and each connector runs straight to its own column with no
 * visual overlap or need for a curve at all.
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
 * `/admin/org-structure/staffing`. Rebuilt 2026-07-25 (see the CSS comment
 * in globals.css for the full "why"): every position renders in the row
 * belonging to its OWN level (not its tree depth). Its horizontal position
 * is driven by `computeSlots` (a real tree-layout pass, not per-row
 * centering) so two positions that don't share a subtree never end up
 * accidentally aligned in the same column, and connector lines (drawn via
 * a measured SVG overlay, so real box heights/wrapping stay accurate)
 * always run as a clean straight elbow with no ambiguity about which
 * position reports to which parent.
 */
export function OrgChartTree({
  positions,
  levels,
  assigneesByPosition,
  emptyLabel,
  vacantLabel,
}: {
  positions: OrgChartPosition[];
  levels: OrgChartLevel[];
  assigneesByPosition: Record<string, string[]>;
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

  const renderedRowIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => positions.some((p) => p.level_id === l.id));
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, positions]);

  const { slotOf, leafCount } = useMemo(() => computeSlots(positions), [positions]);

  const canvasWidth = Math.max(leafCount, 1) * SLOT_WIDTH;
  const canvasHeight = Math.max(renderedRowIndexByLevelId.size, 1) * ROW_HEIGHT;

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
      const x1 = parentRect.left + parentRect.width / 2 - containerRect.left;
      const y1 = parentRect.bottom - containerRect.top;
      const x2 = childRect.left + childRect.width / 2 - containerRect.left;
      const y2 = childRect.top - containerRect.top;
      const midY = (y1 + y2) / 2;
      nextLines.push({ id: p.id, d: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}` });
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
          const rowIndex = renderedRowIndexByLevelId.get(p.level_id) ?? 0;
          const slot = slotOf.get(p.id) ?? 0;
          const color = colorByLevelId.get(p.level_id)!;
          const assignees = assigneesByPosition[p.id] ?? [];
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
                left: slot * SLOT_WIDTH + SLOT_WIDTH / 2,
                top: rowIndex * ROW_HEIGHT,
                transform: "translateX(-50%)",
                background: color.bg,
                color: color.fg,
              }}
            >
              <strong>{p.name_ar}</strong>
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
