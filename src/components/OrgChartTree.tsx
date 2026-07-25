import { Users } from "lucide-react";
import { getContrastTextColor } from "@/lib/color";

interface OrgChartPosition {
  id: string;
  parent_id: string | null;
  level_id: string;
  name_ar: string;
}

interface TreeNode extends OrgChartPosition {
  children: TreeNode[];
}

interface NodeColor {
  bg: string;
  fg: string;
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

function buildForest(positions: OrgChartPosition[]): TreeNode[] {
  const nodeById = new Map<string, TreeNode>(positions.map((p) => [p.id, { ...p, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of nodeById.values()) {
    const parent = node.parent_id ? nodeById.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function OrgChartNodeItem({
  node,
  colorByLevelId,
  assigneesByPosition,
  vacantLabel,
}: {
  node: TreeNode;
  colorByLevelId: Map<string, NodeColor>;
  assigneesByPosition: Record<string, string[]>;
  vacantLabel: string;
}) {
  // Real feedback (2026-07-25): coloring by tree DEPTH made two positions
  // declared at genuinely different org_structure_levels (e.g. C2 and C4,
  // both direct children of the root) render in the identical color —
  // colored by the position's own level_id instead, so the chart actually
  // reflects the levels the admin defined, not just how deep the tree is.
  const color = colorByLevelId.get(node.level_id) ?? THEME_NODE_COLORS[0];
  const assignees = assigneesByPosition[node.id] ?? [];
  return (
    <li>
      <div className="sru-orgchart-node" style={{ background: color.bg, color: color.fg }}>
        <strong>{node.name_ar}</strong>
        <span className="sru-orgchart-node-assignees">
          <Users size={12} />
          {assignees.length > 0 ? assignees.join("، ") : vacantLabel}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OrgChartNodeItem key={child.id} node={child} colorByLevelId={colorByLevelId} assigneesByPosition={assigneesByPosition} vacantLabel={vacantLabel} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface OrgChartLevel {
  id: string;
  level_order: number;
  /** Admin override hex (2026-07-25); NULL falls back to the theme rotation below. */
  color: string | null;
}

/**
 * The org-structure setup wizard's "second output" (2026-07-24): a
 * colorful, professional org-chart tree, complementing the plain editable
 * positions list already on this page and the staffing table on
 * `/admin/org-structure/staffing`. Pure presentational — takes already
 * RLS-fetched positions/assignments as props, same as every other list on
 * this page; no data fetching or write access of its own.
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
  const roots = buildForest(positions);
  if (roots.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{emptyLabel}</p>;
  }

  const sortedLevels = levels.slice().sort((a, b) => a.level_order - b.level_order);
  const colorByLevelId = new Map<string, NodeColor>(
    sortedLevels.map((level, index) => [
      level.id,
      level.color ? { bg: level.color, fg: getContrastTextColor(level.color) } : THEME_NODE_COLORS[index % THEME_NODE_COLORS.length],
    ])
  );

  return (
    <div className="sru-orgchart-wrapper">
      <ul className="sru-orgchart">
        {roots.map((root) => (
          <OrgChartNodeItem key={root.id} node={root} colorByLevelId={colorByLevelId} assigneesByPosition={assigneesByPosition} vacantLabel={vacantLabel} />
        ))}
      </ul>
    </div>
  );
}
