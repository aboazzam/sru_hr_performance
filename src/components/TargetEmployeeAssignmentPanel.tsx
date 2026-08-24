"use client";

import { useMemo, useState, startTransition, useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import {
  saveTargetEmployees,
  recordOrgUnitActual,
  recordEmployeeActual,
  type ExecutivePlanTargetState,
} from "@/app/[locale]/(app)/executive-plans/[id]/actions";
import { ActualValueField } from "@/components/ActualValueField";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  percentage_total: "errorPercentageTotalEmployees",
  duplicate: "errorDuplicateEmployee",
  unknown: "errorUnknown",
};

export interface UnitShareRow {
  shareId: string;
  targetTitle: string;
  targetUnit: string;
  /** This year's target value for the whole KPI, before the unit's split. */
  yearTargetValue: number | null;
  orgUnitId: string;
  orgUnitName: string;
  percentage: number;
  actualValue: number | string | null;
  employees: Array<{
    assignmentId: string;
    employeeId: string;
    employeeName: string;
    percentage: number;
    actualValue: number | string | null;
    /** Who typed the figure — the employee about themselves, or the unit. */
    actualRecordedBy: string | null;
    actualSelfReported: boolean;
  }>;
  /** Whether THIS caller may write this unit's split. */
  canManage: boolean;
}

export interface EmployeeOption {
  id: string;
  label: string;
  orgUnitId: string | null;
}

/**
 * إسناد الموظفين — the second hop of the cascade: a dean or department
 * manager splits their unit's share of a target across their own staff.
 *
 * Only the shares this caller may actually write are editable; the rest are
 * listed read-only, because seeing the whole picture is what makes a split
 * meaningful, while writing outside your own unit is not yours to do. The
 * permission is Postgres's (the scoped `check_vpra` on the share's unit), not
 * this component's — the flag it receives only decides what to render.
 */
export function TargetEmployeeAssignmentPanel({
  shares,
  employees,
}: {
  shares: UnitShareRow[];
  employees: EmployeeOption[];
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const mine = shares.filter((s) => s.canManage);
  const others = shares.filter((s) => !s.canManage);

  if (shares.length === 0) {
    return (
      <div>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8 }}>{t("employeesIntro")}</p>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 10 }}>{t("employeesNoShares")}</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>{t("employeesIntro")}</p>

      <div style={{ display: "grid", gap: 12 }}>
        {mine.map((share) => (
          <ShareCard key={share.shareId} share={share} employees={employees} />
        ))}
      </div>

      {others.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t("employeesOtherUnitsHeading")}</h3>
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 8 }}>{t("employeesOtherUnitsNote")}</p>
          <div style={{ display: "grid", gap: 12 }}>
            {others.map((share) => (
              <ShareCard key={share.shareId} share={share} employees={employees} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ShareCard({ share, employees }: { share: UnitShareRow; employees: EmployeeOption[] }) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const router = useRouter();
  const [rows, setRows] = useState(
    share.employees.map((e) => ({ employeeId: e.employeeId, percentage: String(e.percentage) }))
  );
  // Saved assignments only: an unsaved row has no id to record against yet.
  const savedByEmployee = new Map(share.employees.map((e) => [e.employeeId, e]));
  const [state, formAction, pending] = useActionState<ExecutivePlanTargetState, FormData>(saveTargetEmployees, null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0), [rows]);
  const duplicate = useMemo(() => new Set(rows.map((r) => r.employeeId)).size !== rows.length, [rows]);
  const complete = rows.every((r) => r.employeeId !== "" && Number(r.percentage) > 0);
  const valid = rows.length === 0 || (Math.abs(total - 100) < 0.001 && !duplicate && complete);
  // ...and there has to be something to save. Without this the button stayed
  // lit after a successful save, which reads as "it did not take" — the same
  // defect fixed for the ORG-UNIT split, which lives in a different component
  // and so did not carry over. Compared by shape rather than by a saved flag:
  // an edit that happens to restore what is stored is nothing to save either.
  const savedShape = JSON.stringify(share.employees.map((e) => [e.employeeId, Number(e.percentage)]));
  const currentShape = JSON.stringify(rows.map((r) => [r.employeeId, Number(r.percentage)]));
  const canSave = valid && savedShape !== currentShape;

  // The unit's own slice of the year's target, so the split is made against a
  // real number rather than a bare percentage.
  const unitValue =
    share.yearTargetValue == null ? null : Math.round(((share.yearTargetValue * share.percentage) / 100) * 100) / 100;

  // A department's own staff first — the people this share is actually for.
  const ownUnit = employees.filter((e) => e.orgUnitId === share.orgUnitId);
  const options = ownUnit.length > 0 ? ownUnit : employees;

  return (
    <div className="sru-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700 }}>{share.targetTitle}</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            <span className="sru-initiative-chip">{share.orgUnitName}</span>
            <span className="sru-initiative-chip is-plain">{t("shareOfTarget", { percent: String(share.percentage) })}</span>
            {unitValue != null && (
              <span className="sru-initiative-chip is-plain">
                {t("shareValue", { value: String(unitValue), unit: share.targetUnit })}
              </span>
            )}
          </div>
        </div>
        <span
          style={{
            fontSize: 11.5,
            color: Math.abs(total - 100) < 0.001 || rows.length === 0 ? "var(--sru-muted)" : "var(--sru-danger, #b91c1c)",
          }}
        >
          {t("employeesTotal", { total: String(total) })}
        </span>
      </div>

      {/* The unit's own achievement against its share. */}
      <div style={{ marginTop: 10 }}>
        <ActualValueField
          id={share.shareId}
          initialValue={share.actualValue}
          unit={share.targetUnit}
          label={t("actualUnitLabel")}
          canEdit={share.canManage}
          action={recordOrgUnitActual}
        />
      </div>

      {rows.length === 0 && !share.canManage && (
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 10 }}>{t("employeesNoneYet")}</p>
      )}

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {rows.map((row, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gap: 6,
              paddingTop: index === 0 ? 0 : 10,
              borderTop: index === 0 ? "none" : "1px solid var(--sru-border)",
            }}
          >
            {/* The employee select gets a line to itself. A native select's
                dropdown is exactly as wide as the control, so while this sat in
                the flex row with the percentage, the value and the buttons it
                settled near its minimum width and clipped the option text —
                reported live as "the employee name is cut off". Labels here are
                "number — full name", and real names only get longer than the
                two that surfaced it. */}
            <select
              value={row.employeeId}
              disabled={!share.canManage}
              onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, employeeId: e.target.value } : r)))}
              style={{ width: "100%" }}
            >
              <option value="">{t("employeePlaceholder")}</option>
              {options.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={row.percentage}
              disabled={!share.canManage}
              onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, percentage: e.target.value } : r)))}
              style={{ width: 90 }}
              aria-label={t("employeePercentageLabel")}
            />
            <span style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>%</span>
            {unitValue != null && Number(row.percentage) > 0 && (
              <span style={{ fontSize: 11, color: "var(--sru-muted)" }}>
                {t("employeeValue", {
                  value: String(Math.round(((unitValue * Number(row.percentage)) / 100) * 100) / 100),
                  unit: share.targetUnit,
                })}
              </span>
            )}
            {share.canManage && (
              <button
                type="button"
                className="sru-icon-action"
                title={t("employeeRemove")}
                aria-label={t("employeeRemove")}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
            {savedByEmployee.has(row.employeeId) && (
              <>
                <ActualValueField
                  id={savedByEmployee.get(row.employeeId)!.assignmentId}
                  initialValue={savedByEmployee.get(row.employeeId)!.actualValue}
                  unit={share.targetUnit}
                  label={t("actualEmployeeLabel")}
                  canEdit={share.canManage}
                  action={recordEmployeeActual}
                />
                {savedByEmployee.get(row.employeeId)!.actualRecordedBy && (
                  <span style={{ fontSize: 11, color: "var(--sru-muted)" }}>
                    {savedByEmployee.get(row.employeeId)!.actualSelfReported
                      ? t("actualSelfReportedBy", { name: savedByEmployee.get(row.employeeId)!.actualRecordedBy as string })
                      : t("actualRecordedBy", { name: savedByEmployee.get(row.employeeId)!.actualRecordedBy as string })}
                  </span>
                )}
              </>
            )}
            </div>
          </div>
        ))}
      </div>

      {share.canManage && (
        <>
          {options.length === 0 && (
            <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 8 }}>{t("employeesNoneVisible")}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="sru-btn sru-btn-slim"
              disabled={options.length === 0}
              onClick={() => setRows((prev) => [...prev, { employeeId: "", percentage: "" }])}
            >
              <Plus size={13} aria-hidden />
              {t("employeeAdd")}
            </button>
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={!canSave || pending}
              onClick={() => {
                const formData = new FormData();
                formData.set("shareId", share.shareId);
                formData.set(
                  "rows",
                  JSON.stringify(rows.map((r) => ({ employeeId: r.employeeId, percentage: Number(r.percentage) })))
                );
                startTransition(() => formAction(formData));
              }}
            >
              <Check size={13} aria-hidden />
              {pending ? t("savingButton") : t("employeesSave")}
            </button>
          </div>
        </>
      )}

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
