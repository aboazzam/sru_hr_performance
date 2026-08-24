import { getTranslations } from "next-intl/server";
import { buildOrgTree, type OrgUnitNode } from "@/lib/data/org-units";
import { PrintButton } from "@/components/PrintButton";

function OrgNode({ node, depth }: { node: OrgUnitNode; depth: number }) {
  if (node.children.length === 0) {
    return (
      <li className="org-leaf" style={{ marginInlineStart: depth * 18 }}>
        {node.name}
      </li>
    );
  }

  return (
    <li>
      <details className="org-node" open={depth < 2} style={{ marginInlineStart: depth * 18 }}>
        <summary>
          {node.name}
          <span className="org-count">{node.children.length}</span>
        </summary>
        <ul>
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export default async function OrgChartPage() {
  const tree = buildOrgTree();
  const t = await getTranslations("OrgUnitsPage");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <div className="sru-card">
        <ul className="org-tree">
          {tree.map((root) => (
            <OrgNode key={root.id} node={root} depth={0} />
          ))}
        </ul>
      </div>
    </div>
  );
}
