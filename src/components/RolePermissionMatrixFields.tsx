"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { processAreas, processAreaLabels, processAreaSections, vpraLevelLabels, type ProcessArea, type VpraLevel } from "@/lib/vpra";

const vpraLevels: VpraLevel[] = ["none", "view", "prepare", "recommend", "approve"];

/**
 * Editable VPRA matrix (13 process areas x 5 levels) shared by
 * `CreateRoleForm`/`EditRoleForm`. Rebuilt 2026-07-25 as a checkbox grid
 * per the project owner's explicit request, closer to the reference
 * screenshots' read/create/delete/approve grid — adapted to this app's own
 * exclusive none/view/prepare/recommend/approve scale (one checked box per
 * row, enforced by always setting rather than toggling on click, not four
 * independent booleans) with a "select all" checkbox per column header
 * (checks that level for every area at once) and rows grouped under bold
 * section titles.
 */
export function RolePermissionMatrixFields({
  value,
  onChange,
}: {
  value: Partial<Record<ProcessArea, VpraLevel>>;
  onChange: (area: ProcessArea, level: VpraLevel) => void;
}) {
  const t = useTranslations("AdminPage");

  // Checking a column's header sets every area to that level; UNCHECKING it
  // clears every area back to 'none' — previously this always re-applied
  // `level` regardless of direction, so an all-checked column could never
  // be cleared by clicking its own header checkbox again.
  function handleSelectAllColumn(level: VpraLevel, checked: boolean) {
    const target: VpraLevel = checked ? level : "none";
    for (const area of processAreas) onChange(area, target);
  }

  return (
    <div className="sru-card">
      <div className="table-scroll">
        <table className="admin-matrix sru-permission-grid">
          <thead>
            <tr>
              <th>{t("permissionAreaColumn")}</th>
              {vpraLevels.map((level) => (
                <th key={level}>
                  <label className="sru-permission-selectall">
                    <input
                      type="checkbox"
                      checked={processAreas.every((area) => (value[area] ?? "none") === level)}
                      onChange={(e) => handleSelectAllColumn(level, e.target.checked)}
                      aria-label={t("selectAllColumn", { level: vpraLevelLabels[level] })}
                    />
                    <span>{vpraLevelLabels[level]}</span>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processAreaSections.map((section) => (
              <Fragment key={section.titleAr}>
                <tr className="sru-permission-section-row">
                  <td colSpan={vpraLevels.length + 1}>{section.titleAr}</td>
                </tr>
                {section.areas.map((area) => (
                  <tr key={area}>
                    <td>{processAreaLabels[area]}</td>
                    {vpraLevels.map((level) => (
                      <td key={level} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={(value[area] ?? "none") === level}
                          onChange={() => onChange(area, level)}
                          aria-label={`${processAreaLabels[area]} — ${vpraLevelLabels[level]}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
