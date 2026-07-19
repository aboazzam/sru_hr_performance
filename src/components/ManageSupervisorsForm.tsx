"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  saveSupervisorAssignments,
  type SaveSupervisorAssignmentsState,
} from "@/app/[locale]/(app)/employees/assign-supervisor/actions";

interface EmployeeRow {
  id: string;
  employeeNumber: string;
  fullNameAr: string;
  initialSupervisorId: string | null;
}

type ErrorMessage = Extract<SaveSupervisorAssignmentsState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function ManageSupervisorsForm({ employees }: { employees: EmployeeRow[] }) {
  const t = useTranslations("AssignSupervisorPage");
  const [state, formAction, pending] = useActionState<SaveSupervisorAssignmentsState, FormData>(
    saveSupervisorAssignments,
    null
  );

  const selectClass =
    "w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  return (
    <form action={formAction} className="space-y-6">
      <div className="sru-card">
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>{t("columnEmployee")}</th>
                <th>{t("columnSupervisor")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    {employee.employeeNumber} — {employee.fullNameAr}
                  </td>
                  <td>
                    <select
                      name={`supervisor_${employee.id}`}
                      defaultValue={employee.initialSupervisorId ?? ""}
                      className={selectClass}
                    >
                      <option value="">{t("noSupervisorOption")}</option>
                      {employees
                        .filter((candidate) => candidate.id !== employee.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.employeeNumber} — {candidate.fullNameAr}
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

      {state?.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {t(errorMessageKeys[state.message])}
        </p>
      )}
      {state?.status === "success" && (
        <p role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
          {t("successMessage")}
        </p>
      )}

      <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
