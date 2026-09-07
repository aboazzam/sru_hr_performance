"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OrgUnitTreeNode, BandGroup } from "@/lib/evaluationResultsBreakdown";

/**
 * The نتائج التقييم dashboard's breakdown section: a filter switching
 * between two views of the same broad results (requested directly,
 * 2026-09-08) — "حسب الوحدة التنظيمية" (a real nested tree matching
 * `org_units.parent_id`, same hierarchy the الوحدات التنظيمية screen itself
 * renders) and "حسب الفئة" (the five rating bands, each an expandable
 * `<details>` node listing its real employees — a "فئة ← موظفون" tree).
 * Both are pre-built server-side (`evaluationResultsBreakdown.ts`) — this
 * component only toggles which already-computed view renders.
 */
export function EvaluationResultsBreakdown({
  orgUnitTree,
  bandGroups,
}: {
  orgUnitTree: OrgUnitTreeNode[];
  bandGroups: BandGroup[];
}) {
  const t = useTranslations("EvaluationResultsDashboardPage");
  const [view, setView] = useState<"orgUnit" | "band">("orgUnit");

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }} role="tablist" aria-label={t("breakdownViewLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={view === "orgUnit"}
          className={`sru-btn${view === "orgUnit" ? " sru-btn-primary" : ""}`}
          onClick={() => setView("orgUnit")}
        >
          {t("breakdownViewOrgUnit")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "band"}
          className={`sru-btn${view === "band" ? " sru-btn-primary" : ""}`}
          onClick={() => setView("band")}
        >
          {t("breakdownViewBand")}
        </button>
      </div>

      {view === "orgUnit" ? (
        <div className="sru-card">
          {orgUnitTree.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, padding: 16, margin: 0 }}>{t("distributionEmpty")}</p>
          ) : (
            <div style={{ padding: "12px 16px" }}>
              {orgUnitTree.map((node) => (
                <OrgUnitTreeRow key={node.id} node={node} depth={0} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="sru-card" style={{ padding: 16 }}>
          {bandGroups.every((group) => group.count === 0) ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5, margin: 0 }}>{t("distributionEmpty")}</p>
          ) : (
            bandGroups.map((group) => (
              <details key={group.bandId} style={{ marginBottom: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, padding: "6px 0", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ minWidth: 90 }}>{group.labelAr}</span>
                  <span
                    style={{
                      flex: 1,
                      background: "var(--sru-purple-light)",
                      borderRadius: "var(--sru-radius)",
                      height: 8,
                      overflow: "hidden",
                    }}
                  >
                    <span className={`sru-rating-bar-fill is-${group.bandId}`} style={{ display: "block", width: `${group.pct}%`, height: "100%" }} />
                  </span>
                  <span style={{ color: "var(--sru-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {group.count} ({group.pct}%)
                  </span>
                </summary>
                {group.employees.length === 0 ? (
                  <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: "4px 0 4px 24px" }}>{t("bandGroupEmpty")}</p>
                ) : (
                  <div className="table-scroll" style={{ marginTop: 6 }}>
                    <table className="admin-matrix">
                      <thead>
                        <tr>
                          <th>{t("columnEmployeeName")}</th>
                          <th>{t("orgUnitColumn")}</th>
                          <th>{t("columnScore")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.employees.map((employee, index) => (
                          <tr key={`${employee.employeeNumber ?? index}-${index}`}>
                            <td>
                              {employee.employeeNumber ?? "—"}
                              {employee.employeeName ? ` — ${employee.employeeName}` : ""}
                            </td>
                            <td>{employee.orgUnitName ?? "—"}</td>
                            <td>{employee.score.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function OrgUnitTreeRow({ node, depth }: { node: OrgUnitTreeNode; depth: number }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "6px 0",
          borderBottom: "1px solid var(--sru-border)",
          paddingInlineStart: depth * 20,
        }}
      >
        <span style={{ fontSize: 13 }}>{node.name}</span>
        <span style={{ fontSize: 12, color: "var(--sru-muted)", whiteSpace: "nowrap" }}>
          {node.count > 0 ? `${node.count} — ${(node.average ?? 0).toFixed(1)}%` : "—"}
        </span>
      </div>
      {node.children.map((child) => (
        <OrgUnitTreeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}
