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
  position_staffed: "errorPositionStaffed",
  unknown: "errorUnknown",
};

/**
 * One position under its organizational unit: a name, the occupant's name
 * when staffed, a staffed/vacant status badge, and an icon opening the
 * actual staffing edit — assign or unassign employees. Everything else this
 * row used to carry (name/level/parent/org-unit/color editing, delete)
 * moved to /org-units, where positions themselves are now created and
 * edited (2026-08-31: "فيه أشياء كثيرة هنا لا أحتاجها ... نحتاج فقط
 * التسكين").
 *
 * A position holds at most one active occupant at a time — an employee may
 * still hold several different positions, just not the reverse (2026-08-31
 * follow-up: "لكل منصب شخص واحد فقط ... فهنا اضاف باسل عمر مع اني قد اضفت
 * اسامة صالح"). The assign form below only ever renders while the position
 * is vacant; the real enforcement is `org_structure_assignments_one_per_
 * position_uidx` (20260831000001) plus `assignEmployee` mapping its
 * violation to `position_staffed` — this component hiding the form is a
 * courtesy, not the actual boundary.
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
  // Whenever the assign form actually renders the position is vacant (no
  // assignments to exclude) -- `employees` is used directly rather than
  // filtering it, since exclusion only ever mattered while several
  // employees could share one position.
  const employeeId = selectedEmployeeId ?? employees[0]?.id ?? "";

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
      {isStaffed ? <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{assignments[0].label}</span> : null}
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

        {isStaffed ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--sru-border)" }}>
            {t("alreadyStaffedNote")}
          </p>
        ) : employees.length > 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="sru-field" style={{ flex: 1, minWidth: 200, margin: 0 }}>
              <label htmlFor={`staffing-employee-${positionId}`}>{t("employeeLabel")}</label>
              <select id={`staffing-employee-${positionId}`} value={employeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                {employees.map((employee) => (
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
