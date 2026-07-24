import { Users } from "lucide-react";

interface OrgChartPosition {
  id: string;
  parent_id: string | null;
  name_ar: string;
}

interface TreeNode extends OrgChartPosition {
  children: TreeNode[];
}

// Derived tints/shades of the two SRU identity hues (purple + blue) only —
// CLAUDE.md §7 forbids colors outside the SRU palette, so "colorful" here
// means varied depth within that palette, not an arbitrary rainbow.
const NODE_COLORS = [
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
  depth,
  assigneesByPosition,
  vacantLabel,
}: {
  node: TreeNode;
  depth: number;
  assigneesByPosition: Record<string, string[]>;
  vacantLabel: string;
}) {
  const color = NODE_COLORS[depth % NODE_COLORS.length];
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
            <OrgChartNodeItem key={child.id} node={child} depth={depth + 1} assigneesByPosition={assigneesByPosition} vacantLabel={vacantLabel} />
          ))}
        </ul>
      )}
    </li>
  );
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
  assigneesByPosition,
  emptyLabel,
  vacantLabel,
}: {
  positions: OrgChartPosition[];
  assigneesByPosition: Record<string, string[]>;
  emptyLabel: string;
  vacantLabel: string;
}) {
  const roots = buildForest(positions);
  if (roots.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{emptyLabel}</p>;
  }
  return (
    <div className="sru-orgchart-wrapper">
      <ul className="sru-orgchart">
        {roots.map((root) => (
          <OrgChartNodeItem key={root.id} node={root} depth={0} assigneesByPosition={assigneesByPosition} vacantLabel={vacantLabel} />
        ))}
      </ul>
    </div>
  );
}
