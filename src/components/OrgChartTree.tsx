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

// 2026-08-28: rebuilt AGAIN, this time from the column-per-level (vertical)
// layout back to the classic top-down pyramid (root at top, each level a
// horizontal row below it) -- direct request for a "hierarchical, screen-
// sized" chart, since the vertical rebuild (2026-07-27) traded the original
// horizontal-overflow problem for a vertical one: a 49-position tree grew
// to ~5000px tall, needing constant scrolling just to see its shape either
// way. What actually fixes BOTH directions at once is auto-fit scaling
// (below), not another axis swap alone -- so this keeps the natural,
// universally-recognized top-down org-chart shape and wraps it in a
// bounded, auto-scaled viewport instead of ever growing the page itself.
const SLOT_WIDTH = 226; // horizontal spacing per sibling slot -- node width (190px) is set in globals.css
const LEVEL_HEIGHT = 188; // vertical spacing per depth row
const MIN_SCALE = 0.28;
const MAX_SCALE = 2;
const ZOOM_STEP = 0.18;

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
 * one slot before this existed. This slot value drives horizontal position
 * (each level is a row, siblings spread left-to-right) — the algorithm
 * itself is orientation-agnostic and has survived two layout rebuilds
 * unchanged.
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
 * `/admin/org-structure/staffing`. Root renders at the TOP, each level a
 * horizontal row below it (mirrored for RTL: a root's first-visited child
 * renders at the chart's RIGHT edge), siblings spread left-to-right within
 * their row via `computeSlots`. The whole tree is auto-scaled to fit inside
 * a bounded viewport (below) instead of letting the page grow indefinitely
 * in either direction — the actual fix for the "a worker can't see the
 * chart" complaints this component has already been rebuilt twice to chase
 * on a single axis at a time. Manual +/- zoom and a "fit" reset are offered
 * for anyone who wants to read a compressed chart's fine print. Connector
 * lines (drawn via a measured SVG overlay, so real box heights/wrapping
 * stay accurate) always run as a clean elbow with no ambiguity about which
 * position reports to which parent.
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

  // Row index per level (0 = root/level_order 1, increasing with depth).
  const rowIndexByLevelId = useMemo(() => {
    const occupiedLevels = sortedLevels.filter((l) => positions.some((p) => p.level_id === l.id));
    return new Map(occupiedLevels.map((l, index) => [l.id, index]));
  }, [sortedLevels, positions]);
  const rowCount = Math.max(rowIndexByLevelId.size, 1);

  const { slotOf, leafCount } = useMemo(() => computeSlots(positions), [positions]);

  // Natural (unscaled) canvas size, purely data-driven — LEVEL_HEIGHT is
  // sized generously for real content (see the constant's own history), so
  // this doesn't need a DOM-measured second pass just to compute the fit
  // ratio; only the connector lines need real measured box edges below.
  const naturalWidth = Math.max(leafCount, 1) * SLOT_WIDTH;
  const naturalHeight = rowCount * LEVEL_HEIGHT;

  function slotLeft(slot: number) {
    // Mirrored for RTL: slot 0 (the first-visited child) renders at the
    // chart's right edge, matching this app's right-to-left reading flow.
    return (Math.max(leafCount, 1) - 1 - slot) * SLOT_WIDTH + SLOT_WIDTH / 2;
  }

  function rowTop(levelId: string) {
    const rowIndex = rowIndexByLevelId.get(levelId) ?? 0;
    return rowIndex * LEVEL_HEIGHT + LEVEL_HEIGHT / 2;
  }

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
  // this SVG's own coordinate space) are always expressed pre-scale.
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
  }, [positions, levels, scale]);

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
                    left: slotLeft(slot),
                    top: rowTop(p.level_id),
                    transform: "translate(-50%, -50%)",
                    background: color.bg,
                    color: color.fg,
                  }}
                >
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
