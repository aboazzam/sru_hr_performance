"use client";

import { useState, useTransition } from "react";
import { Check, Trash2, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, unassignEmployee, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";
import { computeEligibleParentPositions, isRootLevelOrder } from "@/lib/orgStructurePositions";

interface Assignment {
  id: string;
  label: string;
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

interface LevelOption {
  id: string;
  level_order: number;
}

interface PositionOption {
  id: string;
  name_ar: string;
  level_id: string;
  parent_id: string | null;
}

export function OrgStructurePositionRow({
  levelName,
  levelId,
  parentName,
  positionId,
  initialNameAr,
  initialNameEn,
  initialOrgUnitId,
  initialParentId,
  orgUnits,
  levels,
  positions,
  jobTitle,
  assignments,
  orgUnitEmployeeLabels,
}: {
  levelName: string;
  levelId: string;
  parentName: string;
  positionId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialOrgUnitId: string | null;
  initialParentId: string | null;
  orgUnits: OrgUnitOption[];
  levels: LevelOption[];
  positions: PositionOption[];
  /** 2026-07-27: position's linked job_titles.name_ar, when set. Read-only here (no edit UI yet), same as the org chart. */
  jobTitle: string | null;
  assignments: Assignment[];
  // Employees whose own `profiles.org_unit_id` matches this position's
  // linked org unit OR any of that unit's descendant units in
  // `org_units.parent_id` (2026-07-26) — distinct from `assignments` (who
  // is explicitly staffed onto this exact position node). This is the
  // actual answer to "لا نجد الموظفين التابعين لمدير ادارة معينة": the
  // position's org-unit link lets this list surface every real employee in
  // that department AND its sub-units, not just whoever happens to be
  // individually staffed here or in the exact linked unit alone.
  orgUnitEmployeeLabels: string[];
}) {
  const t = useTranslations("OrgStructureStaffingPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isUnassigning, startUnassigning] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [orgUnitId, setOrgUnitId] = useState(initialOrgUnitId ?? "");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    nameAr !== initialNameAr ||
    nameEn !== (initialNameEn ?? "") ||
    orgUnitId !== (initialOrgUnitId ?? "") ||
    parentId !== (initialParentId ?? "");

  // Same rule/exclusions as OrgStructurePositionMiniRow -- see
  // src/lib/orgStructurePositions.ts for the full rationale
  // (2026-08-05 "اضف خاصية تغيير التبعية").
  const levelOrderById = new Map(levels.map((l) => [l.id, l.level_order]));
  const ownLevelOrder = levelOrderById.get(levelId);
  const isRootLevel = isRootLevelOrder(ownLevelOrder, levels);
  const parentOptions = computeEligibleParentPositions(positionId, ownLevelOrder, levels, positions);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    has_dependents: "errorHasDependents",
    unknown: "errorUnknown",
  };

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const res = await updatePosition(positionId, nameAr, nameEn, orgUnitId || null, isRootLevel ? null : parentId || null);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deletePositionConfirm"))) return;
    setError(null);
    startDeleting(async () => {
      const res = await deletePosition(positionId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function handleUnassign(assignmentId: string) {
    setError(null);
    setUnassigningId(assignmentId);
    startUnassigning(async () => {
      const res = await unassignEmployee(assignmentId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <tr>
      <td style={{ verticalAlign: "top", fontSize: 12 }}>{levelName}</td>
      <td style={{ verticalAlign: "top" }}>
        {isRootLevel ? (
          <span style={{ fontSize: 12 }}>{parentName}</span>
        ) : parentOptions.length === 0 ? (
          <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("noParentOptions")}</span>
        ) : (
          <div className="sru-position-edit-field">
            <label htmlFor={`row-parent-${positionId}`}>{t("positionParentLabel")}</label>
            <select id={`row-parent-${positionId}`} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {parentOptions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name_ar}
                </option>
              ))}
            </select>
          </div>
        )}
      </td>
      <td>
        <div className="sru-position-edit-field" style={{ marginBottom: 8 }}>
          <label htmlFor={`row-nameAr-${positionId}`}>{t("positionNameArLabel")}</label>
          <input id={`row-nameAr-${positionId}`} value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </div>
        <div className="sru-position-edit-field" style={{ marginBottom: 8 }}>
          <label htmlFor={`row-nameEn-${positionId}`}>{t("positionNameEnLabel")}</label>
          <input id={`row-nameEn-${positionId}`} value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
        </div>
        <div className="sru-position-edit-field">
          <label htmlFor={`row-orgUnit-${positionId}`}>{t("positionOrgUnitLabel")}</label>
          <select id={`row-orgUnit-${positionId}`} value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
            <option value="">{t("positionOrgUnitNone")}</option>
            {orgUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name_ar}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td style={{ verticalAlign: "top", fontSize: 12 }}>{jobTitle ?? <span style={{ color: "var(--sru-muted)" }}>—</span>}</td>
      <td>
        {assignments.length === 0 ? (
          <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>—</span>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
            {assignments.map((assignment) => (
              <li key={assignment.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12 }}>{assignment.label}</span>
                <button
                  type="button"
                  disabled={isUnassigning && unassigningId === assignment.id}
                  onClick={() => handleUnassign(assignment.id)}
                  className="sru-icon-action danger"
                  title={t("unassignButton")}
                  aria-label={t("unassignButton")}
                >
                  <UserMinus size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {orgUnitEmployeeLabels.length === 0 ? (
          <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>—</span>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: 0 }}>
            {orgUnitEmployeeLabels.map((label) => (
              <li key={label} style={{ fontSize: 12 }}>
                {label}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        <div className="sru-icon-action-group">
          <button
            type="button"
            disabled={isSaving || !isDirty || (!isRootLevel && parentOptions.length === 0)}
            onClick={handleSave}
            className="sru-icon-action primary"
            title={t("saveButton")}
            aria-label={t("saveButton")}
          >
            <Check size={15} />
          </button>
          <span className="sru-position-edit-actions-divider" aria-hidden="true" />
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-icon-action danger" title={t("deleteButton")} aria-label={t("deleteButton")}>
            <Trash2 size={15} />
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600" style={{ marginTop: 4 }}>
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </p>
        )}
      </td>
    </tr>
  );
}
