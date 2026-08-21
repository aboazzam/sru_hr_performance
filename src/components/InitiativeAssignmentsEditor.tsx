"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Plus, X } from "lucide-react";
import {
  saveInitiativeAssignments,
  type AssignmentActionState,
} from "@/app/[locale]/(app)/initiative-assignments/actions";

export type AssignmentRole = "lead" | "participant" | "supporter";

export interface AssignmentView {
  orgUnitId: string;
  orgUnitName: string;
  role: AssignmentRole;
  percentage: number | null;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  not_hundred: "errorNotHundred",
  no_lead: "errorNoLead",
  duplicate_unit: "errorDuplicateUnit",
  unknown: "errorUnknown",
};

interface DraftRow {
  orgUnitId: string;
  role: AssignmentRole;
  percentage: string;
}

/**
 * Which departments own, share and support one initiative — the same editor
 * on the assignment screen and inside the initiative's own card dialog.
 *
 * Extracted from InitiativeAssignmentsPanel when the card editor gained it
 * (2026-08-21 request: "بطاقة التحرير لا تعطيني الجهات المشاركة"), rather
 * than copied: this project has been bitten before by one fix landing in only
 * one of two places that both needed it.
 *
 * The confirmed rules are surfaced as they are typed: the running total shows
 * live and Save stays disabled until the assigned units total exactly 100%,
 * while supporting units carry no percentage at all. The database enforces
 * the same rules in one transaction (`save_initiative_assignments`), so this
 * is a convenience, not the guarantee.
 */
export function InitiativeAssignmentsEditor({
  initiativeId,
  assignments,
  orgUnits,
  onCancel,
  onSaved,
}: {
  initiativeId: string;
  assignments: AssignmentView[];
  orgUnits: Array<{ id: string; name: string }>;
  /** Omit to hide the cancel button (inside a dialog, the dialog closes it). */
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const t = useTranslations("InitiativeAssignmentsPage");
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() =>
    assignments.length > 0
      ? assignments.map((a) => ({
          orgUnitId: a.orgUnitId,
          role: a.role,
          percentage: a.percentage != null ? String(a.percentage) : "",
        }))
      : [{ orgUnitId: orgUnits[0]?.id ?? "", role: "lead", percentage: "100" }]
  );
  const [state, formAction, pending] = useActionState<AssignmentActionState, FormData>(saveInitiativeAssignments, null);
  const [handled, setHandled] = useState<AssignmentActionState>(null);

  // Derived during render, never in an effect (react-hooks/set-state-in-effect).
  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") onSaved?.();
  }

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  const assignedRows = rows.filter((r) => r.role !== "supporter");
  const total = assignedRows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
  const leadCount = rows.filter((r) => r.role === "lead").length;
  const duplicateUnit = new Set(rows.map((r) => r.orgUnitId)).size !== rows.length;
  const canSave =
    rows.length === 0 ||
    (Math.abs(total - 100) < 0.001 && leadCount === 1 && !duplicateUnit && rows.every((r) => r.orgUnitId !== ""));

  function submit() {
    const formData = new FormData();
    formData.set("initiativeId", initiativeId);
    formData.set(
      "rows",
      JSON.stringify(
        rows.map((r) => ({
          orgUnitId: r.orgUnitId,
          role: r.role,
          percentage: r.role === "supporter" ? null : Number(r.percentage),
        }))
      )
    );
    startTransition(() => formAction(formData));
  }

  return (
    <div className="sru-position-edit-card" style={{ marginTop: 14 }}>
      <span className="sru-position-edit-title">{t("formHeading")}</span>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 10 }}>{t("formNote")}</p>

      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("columnUnit")}</th>
              <th>{t("columnRole")}</th>
              <th>{t("columnPercentage")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  <select
                    value={row.orgUnitId}
                    onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, orgUnitId: e.target.value } : r)))}
                  >
                    <option value="">{t("unitPlaceholder")}</option>
                    {orgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const role = e.target.value as AssignmentRole;
                      setRows(
                        rows.map((r, i) =>
                          i === index ? { ...r, role, percentage: role === "supporter" ? "" : r.percentage } : r
                        )
                      );
                    }}
                  >
                    <option value="lead">{t("roleLead")}</option>
                    <option value="participant">{t("roleParticipant")}</option>
                    <option value="supporter">{t("roleSupporter")}</option>
                  </select>
                </td>
                <td>
                  {row.role === "supporter" ? (
                    <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("noPercentage")}</span>
                  ) : (
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      dir="ltr"
                      style={{ width: 90, textAlign: "start" }}
                      value={row.percentage}
                      onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, percentage: e.target.value } : r)))}
                    />
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="sru-icon-action"
                    title={t("removeRow")}
                    aria-label={t("removeRow")}
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    <X size={15} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <button
          type="button"
          className="sru-btn"
          onClick={() => setRows([...rows, { orgUnitId: "", role: "participant", percentage: "" }])}
        >
          <Plus size={14} aria-hidden />
          {t("addUnitRow")}
        </button>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: Math.abs(total - 100) < 0.001 ? "inherit" : "var(--sru-danger, #b91c1c)",
          }}
        >
          {t("totalLabel", { total: Number(total.toFixed(2)) })}
        </span>
        {leadCount !== 1 && rows.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--sru-danger, #b91c1c)" }}>{t("errorNoLead")}</span>
        )}
        {duplicateUnit && <span style={{ fontSize: 12, color: "var(--sru-danger, #b91c1c)" }}>{t("errorDuplicateUnit")}</span>}
      </div>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="sru-btn sru-btn-primary" disabled={pending || !canSave} onClick={submit}>
          {pending ? t("saving") : t("save")}
        </button>
        {onCancel && (
          <button type="button" className="sru-btn" onClick={onCancel}>
            {t("cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
