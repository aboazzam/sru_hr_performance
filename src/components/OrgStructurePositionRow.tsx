"use client";

import { useState, useTransition } from "react";
import { Check, Trash2, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, unassignEmployee, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface Assignment {
  id: string;
  label: string;
}

interface OrgUnitOption {
  id: string;
  name_ar: string;
}

export function OrgStructurePositionRow({
  levelName,
  parentName,
  positionId,
  initialNameAr,
  initialNameEn,
  initialOrgUnitId,
  orgUnits,
  assignments,
  orgUnitEmployeeLabels,
}: {
  levelName: string;
  parentName: string;
  positionId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  initialOrgUnitId: string | null;
  orgUnits: OrgUnitOption[];
  assignments: Assignment[];
  // Employees whose own `profiles.org_unit_id` matches this position's
  // linked org unit (2026-07-26) — distinct from `assignments` (who is
  // explicitly staffed onto this exact position node). This is the actual
  // answer to "لا نجد الموظفين التابعين لمدير ادارة معينة": the position's
  // org-unit link lets this list surface every real employee in that
  // department, not just whoever happens to be individually staffed here.
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
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty = nameAr !== initialNameAr || nameEn !== (initialNameEn ?? "") || orgUnitId !== (initialOrgUnitId ?? "");

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
      const res = await updatePosition(positionId, nameAr, nameEn, orgUnitId || null);
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
      <td style={{ verticalAlign: "top", fontSize: 13 }}>{levelName}</td>
      <td style={{ verticalAlign: "top", fontSize: 13 }}>{parentName}</td>
      <td>
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} className={inputClass} style={{ marginBottom: 4 }} />
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} style={{ marginBottom: 4 }} />
        <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} className={inputClass} aria-label={t("positionOrgUnitLabel")}>
          <option value="">{t("positionOrgUnitNone")}</option>
          {orgUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name_ar}
            </option>
          ))}
        </select>
      </td>
      <td>
        {assignments.length === 0 ? (
          <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>—</span>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
            {assignments.map((assignment) => (
              <li key={assignment.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{assignment.label}</span>
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
          <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>—</span>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: 0 }}>
            {orgUnitEmployeeLabels.map((label) => (
              <li key={label} style={{ fontSize: 13 }}>
                {label}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        <div className="sru-icon-action-group">
          <button type="button" disabled={isSaving || !isDirty} onClick={handleSave} className="sru-icon-action primary" title={t("saveButton")} aria-label={t("saveButton")}>
            <Check size={15} />
          </button>
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
