"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updatePosition, unassignEmployee, deletePosition } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface Assignment {
  id: string;
  label: string;
}

export function OrgStructurePositionRow({
  levelName,
  parentName,
  positionId,
  initialNameAr,
  initialNameEn,
  assignments,
}: {
  levelName: string;
  parentName: string;
  positionId: string;
  initialNameAr: string;
  initialNameEn: string | null;
  assignments: Assignment[];
}) {
  const t = useTranslations("OrgStructureStaffingPage");
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isUnassigning, startUnassigning] = useTransition();
  const [nameAr, setNameAr] = useState(initialNameAr);
  const [nameEn, setNameEn] = useState(initialNameEn ?? "");
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await updatePosition(positionId, nameAr, nameEn);
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
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" className={inputClass} />
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
                  className="sru-btn"
                  style={{ fontSize: 11.5, padding: "3px 8px" }}
                >
                  {t("unassignButton")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={isSaving} onClick={handleSave} className="sru-btn sru-btn-primary" style={{ fontSize: 12.5, padding: "5px 10px" }}>
            {t("saveButton")}
          </button>
          <button type="button" disabled={isDeleting} onClick={handleDelete} className="sru-btn" style={{ fontSize: 12.5, padding: "5px 10px" }}>
            {t("deleteButton")}
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
