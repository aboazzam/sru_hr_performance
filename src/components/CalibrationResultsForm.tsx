"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  saveCalibrationResults,
  type SaveCalibrationResultsState,
} from "@/app/[locale]/(app)/calibration/[id]/actions";

interface EmployeeRow {
  id: string;
  employeeNumber: string;
  fullNameAr: string;
  initialOriginalRating: number | null;
  initialCalibratedRating: number | null;
  initialJustification: string | null;
}

type ErrorMessage = Extract<SaveCalibrationResultsState, { status: "error" }>["message"];

const errorMessageKeys: Record<ErrorMessage, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  not_found: "errorNotFound",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

export function CalibrationResultsForm({
  sessionId,
  employees,
}: {
  sessionId: string;
  employees: EmployeeRow[];
}) {
  const t = useTranslations("CalibrationSessionDetailPage");
  const [state, formAction, pending] = useActionState<SaveCalibrationResultsState, FormData>(
    saveCalibrationResults.bind(null, sessionId),
    null
  );

  const ratingInputClass =
    "w-24 px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";
  const textInputClass =
    "w-full px-2 py-1 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike -- here
  // that would wipe every employee's just-entered rating/justification on a
  // single validation error, not just the one row that failed.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="sru-card">
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>{t("columnEmployee")}</th>
                <th>{t("columnOriginalRating")}</th>
                <th>{t("columnCalibratedRating")}</th>
                <th>{t("columnJustification")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    {employee.employeeNumber} — {employee.fullNameAr}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      name={`original_${employee.id}`}
                      defaultValue={employee.initialOriginalRating ?? ""}
                      className={ratingInputClass}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      name={`calibrated_${employee.id}`}
                      defaultValue={employee.initialCalibratedRating ?? ""}
                      className={ratingInputClass}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      name={`justification_${employee.id}`}
                      defaultValue={employee.initialJustification ?? ""}
                      className={textInputClass}
                    />
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
        <p role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 12 }}>
          {t("successMessage")}
        </p>
      )}

      <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
