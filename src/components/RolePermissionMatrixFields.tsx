"use client";

import { useTranslations } from "next-intl";
import { processAreas, processAreaLabels, vpraLevelLabels, type ProcessArea, type VpraLevel } from "@/lib/vpra";

const vpraLevels: VpraLevel[] = ["none", "view", "prepare", "recommend", "approve"];

const selectClass =
  "w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

/**
 * Editable VPRA matrix (13 process areas x 5 levels) shared by
 * `CreateRoleForm`/`EditRoleForm` (2026-07-24) — the "position permission
 * editor" the project owner asked to base this on, adapted from the
 * reference screenshots' read/create/delete/approve checkbox grid to this
 * app's own none/view/prepare/recommend/approve VPRA scale instead of
 * literally copying the four-checkbox model.
 */
export function RolePermissionMatrixFields({
  value,
  onChange,
}: {
  value: Partial<Record<ProcessArea, VpraLevel>>;
  onChange: (area: ProcessArea, level: VpraLevel) => void;
}) {
  const t = useTranslations("AdminPage");
  return (
    <div className="sru-card">
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("permissionAreaColumn")}</th>
              <th>{t("permissionLevelColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {processAreas.map((area) => (
              <tr key={area}>
                <td>{processAreaLabels[area]}</td>
                <td>
                  <select
                    value={value[area] ?? "none"}
                    onChange={(e) => onChange(area, e.target.value as VpraLevel)}
                    className={selectClass}
                    style={{ maxWidth: 160 }}
                  >
                    {vpraLevels.map((level) => (
                      <option key={level} value={level}>
                        {vpraLevelLabels[level]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
