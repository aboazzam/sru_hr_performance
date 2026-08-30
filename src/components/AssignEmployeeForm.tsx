"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Link2, User } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { assignEmployee } from "@/app/[locale]/(app)/admin/org-structure/actions";

const inputClass =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface PositionOption {
  id: string;
  label: string;
}

interface EmployeeOption {
  id: string;
  label: string;
}

export function AssignEmployeeForm({ positions, employees }: { positions: PositionOption[]; employees: EmployeeOption[] }) {
  const t = useTranslations("OrgStructureStaffingPage");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Same class of bug fixed in AddOrgStructurePositionForm: this component
  // stays mounted (it returns null below) while `positions` starts empty,
  // then becomes non-empty after router.refresh() adds the first position.
  // Seeding useState directly from `positions[0]?.id` would go stale the
  // moment that happens; deriving the effective value fresh on every render
  // (falling back only when the user hasn't explicitly picked one) avoids it.
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const positionId = selectedPositionId ?? positions[0]?.id ?? "";
  const employeeId = selectedEmployeeId ?? employees[0]?.id ?? "";
  const [error, setError] = useState<string | null>(null);

  const errorMessageKeys: Record<string, string> = {
    invalid_input: "errorInvalid",
    unauthenticated: "errorForbidden",
    forbidden: "errorForbidden",
    duplicate: "errorDuplicate",
    unknown: "errorUnknown",
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await assignEmployee(positionId, employeeId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  if (positions.length === 0 || employees.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="sru-card sru-assign-employee-form">
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t("assignHeading")}</h3>
      {/* المنصب أولًا في الترميز فيظهر يمينًا في RTL، والموظف بعده فيظهر
          يسارًا — موصولان بشارة ربط بينهما بدل تكديسهما عموديًا. */}
      <div className="sru-assign-employee-row">
        <div className="sru-assign-employee-field">
          <label className="sru-assign-employee-field-label">
            <Briefcase size={14} aria-hidden />
            {t("positionLabel")}
          </label>
          <select value={positionId} onChange={(e) => setSelectedPositionId(e.target.value)} required className={inputClass}>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sru-assign-employee-connector" aria-hidden="true">
          <Link2 size={16} />
        </div>
        <div className="sru-assign-employee-field">
          <label className="sru-assign-employee-field-label">
            <User size={14} aria-hidden />
            {t("employeeLabel")}
          </label>
          <select value={employeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} required className={inputClass}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600" style={{ marginTop: 10 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      )}
      <button type="submit" disabled={isPending} className="sru-btn sru-btn-primary" style={{ marginTop: 12 }}>
        {t("assignButton")}
      </button>
    </form>
  );
}
