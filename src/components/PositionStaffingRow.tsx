"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserCheck, UserX, UserCog, UserMinus, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
import { assignEmployee, unassignEmployee } from "@/app/[locale]/(app)/admin/org-structure/actions";

interface Assignment {
  id: string;
  employeeId: string;
  label: string;
}

interface EmployeeOption {
  id: string;
  label: string;
}

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalid",
  unauthenticated: "errorForbidden",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * One position under its organizational unit: a name, a staffed/vacant
 * status badge, and an icon opening the actual staffing edit — assign or
 * unassign employees. Everything else this row used to carry (name/level/
 * parent/org-unit/color editing, delete) moved to /org-units, where
 * positions themselves are now created and edited (2026-08-31: "فيه أشياء
 * كثيرة هنا لا أحتاجها ... نحتاج فقط التسكين").
 */
export function PositionStaffingRow({
  positionId,
  nameAr,
  nameEn,
  assignments,
  employees,
}: {
  positionId: string;
  nameAr: string;
  nameEn: string | null;
  assignments: Assignment[];
  employees: EmployeeOption[];
}) {
  const t = useTranslations("OrgStructureStaffingPage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isAssigning, startAssigning] = useTransition();
  const [isUnassigning, startUnassigning] = useTransition();
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStaffed = assignments.length > 0;
  const assignedIds = new Set(assignments.map((assignment) => assignment.employeeId));
  const availableEmployees = employees.filter((employee) => !assignedIds.has(employee.id));
  const employeeId = selectedEmployeeId ?? availableEmployees[0]?.id ?? "";

  function handleAssign() {
    if (!employeeId) return;
    setError(null);
    startAssigning(async () => {
      const res = await assignEmployee(positionId, employeeId);
      if (res.status === "success") {
        setSelectedEmployeeId(null);
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
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--sru-border)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: 160 }}>
        {nameAr}
        {nameEn ? <span className="sru-name-en">{nameEn}</span> : null}
      </span>
      <span
        className="pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: isStaffed ? "var(--sru-success, #1f9d55)" : "var(--sru-muted)",
        }}
        title={isStaffed ? t("statusStaffed") : t("statusVacant")}
      >
        {isStaffed ? <UserCheck size={13} aria-hidden /> : <UserX size={13} aria-hidden />}
        {isStaffed ? t("statusStaffed") : t("statusVacant")}
      </span>

      <AddFormDialog
        dialogRef={dialogRef}
        triggerLabel={t("manageStaffingButton")}
        heading={t("manageStaffingHeading")}
        subtitle={nameAr}
        closeLabel={t("closeButton")}
        triggerClassName="sru-icon-action"
        triggerIcon={<UserCog size={14} aria-hidden />}
      >
        {assignments.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("noAssignmentsYet")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {assignments.map((assignment) => (
              <li key={assignment.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13 }}>{assignment.label}</span>
                <button
                  type="button"
                  disabled={isUnassigning && unassigningId === assignment.id}
                  onClick={() => handleUnassign(assignment.id)}
                  className="sru-icon-action danger"
                  title={t("unassignButton")}
                  aria-label={t("unassignButton")}
                >
                  <UserMinus size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {availableEmployees.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
              paddingTop: assignments.length > 0 ? 12 : 0,
              borderTop: assignments.length > 0 ? "1px dashed var(--sru-border)" : "none",
            }}
          >
            <div className="sru-field" style={{ flex: 1, minWidth: 200, margin: 0 }}>
              <label htmlFor={`staffing-employee-${positionId}`}>{t("employeeLabel")}</label>
              <select id={`staffing-employee-${positionId}`} value={employeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                {availableEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={isAssigning || !employeeId}
              onClick={handleAssign}
            >
              <Plus size={14} aria-hidden />
              {t("assignButton")}
            </button>
          </div>
        ) : (
          <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("noMoreEmployees")}</p>
        )}

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </p>
        ) : null}
      </AddFormDialog>
    </li>
  );
}
