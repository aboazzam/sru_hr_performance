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
 * The org-structure setup wizard's "second output" (2026-07-24): a
 * colorful, professional org-chart tree, complementing the plain editable
 * positions list already on this page and the staffing table on
 * `/admin/org-structure/staffing`. Rebuilt 2026-07-25 (see the CSS comment
 * in globals.css for the full "why"): every position renders in the row
 * belonging to its OWN level (not its tree depth), and connector lines are
 * drawn via a measured SVG overlay so a skip-level link (a position linked
 * to any ancestor level, not just the immediately preceding one) renders as
 * a real line spanning the actual vertical gap, not a one-row hop.
 *
 * Follow-up (2026-07-25): a straight line for a skip-level connection still
 * visually passed right through whatever row(s) sat in between, reading as
 * a chain through them ("مدير رأس المال البشري يتبع مباشرة الرئيس
 * التنفيذي وليس نائب الرئيس"). Skip connections now bow out to the side
 * and back (see `measure()`) so they visibly route around the intervening
 * row instead of appearing to pass through it.
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

  const positionsByLevelId = useMemo(() => {
    const map = new Map<string, OrgChartPosition[]>();
    for (const p of positions) {
      const list = map.get(p.level_id);
      if (list) list.push(p);
      else map.set(p.level_id, [p]);
    }
    return map;
  }, [positions]);

  const positionById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  // Real feedback (2026-07-25): "لكن مدير رأس المال البشري يتبع مباشرة
  // الرئيس التنفيذي (1) وليس نائب الرئيس (C2)" -- a straight connector line
  // between a parent and a grandchild-level position visually passes right
  // through any level rendered in between (e.g. CEO -> C4, skipping C2's
  // row), reading as a chain (CEO -> C2 -> C4) even though C2 has nothing
  // to do with it. `renderedRowIndexByLevelId` only counts OCCUPIED levels
  // (matching what's actually drawn as a row below), so the gap it measures
  // reflects real visual rows, not raw level_order values.
  const renderedRowIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => (positionsByLevelId.get(l.id)?.length ?? 0) > 0);
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, positionsByLevelId]);

  const measure = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const nextLines: ConnectorLine[] = [];
    let skipCount = 0;
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

      const parentRow = renderedRowIndexByLevelId.get(parent.level_id);
      const childRow = renderedRowIndexByLevelId.get(p.level_id);
      const isSkip = parentRow != null && childRow != null && childRow - parentRow > 1;

      let d: string;
      if (!isSkip) {
        const midY = (y1 + y2) / 2;
        d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      } else {
        // Bows the line out to one side and back, visibly routing AROUND
        // whatever row(s) sit between parent and child instead of straight
        // through their center — alternating sides and widening per extra
        // concurrent skip connector so several don't stack on top of each other.
        const side = skipCount % 2 === 0 ? 1 : -1;
        const offset = (90 + Math.floor(skipCount / 2) * 40) * side;
        const bendGap = 18;
        const cx1 = x1 + offset;
        const cx2 = x2 + offset;
        d = `M ${x1} ${y1} L ${x1} ${y1 + bendGap} Q ${cx1} ${y1 + bendGap} ${cx1} ${y1 + bendGap * 2} L ${cx2} ${y2 - bendGap * 2} Q ${cx2} ${y2 - bendGap} ${x2} ${y2 - bendGap} L ${x2} ${y2}`;
        skipCount++;
      }
      nextLines.push({ id: p.id, d });
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
      <svg className="sru-orgchart-lines">
        {lines.map((line) => (
          <path key={line.id} d={line.d} fill="none" stroke="var(--sru-border)" strokeWidth={2} />
        ))}
      </svg>
      {sortedLevels.map((level) => {
        const levelPositions = positionsByLevelId.get(level.id);
        if (!levelPositions || levelPositions.length === 0) return null;
        const color = colorByLevelId.get(level.id)!;
        return (
          <div key={level.id} className="sru-orgchart-row">
            {levelPositions.map((p) => {
              const assignees = assigneesByPosition[p.id] ?? [];
              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) nodeElsRef.current.set(p.id, el);
                    else nodeElsRef.current.delete(p.id);
                  }}
                  className="sru-orgchart-node"
                  style={{ background: color.bg, color: color.fg }}
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
        );
      })}
    </div>
  );
}
