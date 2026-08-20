"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Building2, Pencil, Plus, Target, Trash2, X } from "lucide-react";
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

export interface AssignableInitiative {
  id: string;
  titleAr: string;
  planName: string;
  /** مستهدف الخطة — pulled from the strategic goals tab (the KPI's plan target). */
  planTargets: string[];
  /** مستهدف الخطة السنوية — the annual target rows for those same KPIs. */
  annualTargets: string[];
  startDate: string | null;
  endDate: string | null;
  assignments: AssignmentView[];
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
 * إسناد المبادرات — every initiative of the strategic plan, assigned and
 * unassigned alike, with the assignment form opening INSIDE the page (no
 * navigation), as requested.
 *
 * The confirmed rules are surfaced as they are typed: the running total is
 * shown live and Save stays disabled until the assigned units total exactly
 * 100%, while supporting units carry no percentage at all. The database
 * enforces the same rules in one transaction (save_initiative_assignments),
 * so the UI is a convenience, not the guarantee.
 */
export function InitiativeAssignmentsPanel({
  initiatives,
  orgUnits,
  canAssign,
}: {
  initiatives: AssignableInitiative[];
  orgUnits: Array<{ id: string; name: string }>;
  canAssign: boolean;
}) {
  const t = useTranslations("InitiativeAssignmentsPage");
  const assigned = initiatives.filter((i) => i.assignments.length > 0);
  const unassigned = initiatives.filter((i) => i.assignments.length === 0);

  return (
    <div>
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{t("assignedHeading", { count: assigned.length })}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 12 }}>{t("assignedIntro")}</p>
        {assigned.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("assignedEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {assigned.map((initiative) => (
              <InitiativeCard key={initiative.id} initiative={initiative} orgUnits={orgUnits} canAssign={canAssign} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{t("unassignedHeading", { count: unassigned.length })}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 12 }}>{t("unassignedIntro")}</p>
        {unassigned.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("unassignedEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {unassigned.map((initiative) => (
              <InitiativeCard key={initiative.id} initiative={initiative} orgUnits={orgUnits} canAssign={canAssign} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InitiativeCard({
  initiative,
  orgUnits,
  canAssign,
}: {
  initiative: AssignableInitiative;
  orgUnits: Array<{ id: string; name: string }>;
  canAssign: boolean;
}) {
  const t = useTranslations("InitiativeAssignmentsPage");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [state, formAction, pending] = useActionState<AssignmentActionState, FormData>(saveInitiativeAssignments, null);
  const [handled, setHandled] = useState<AssignmentActionState>(null);

  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") setOpen(false);
  }

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  function startEditing() {
    setRows(
      initiative.assignments.length > 0
        ? initiative.assignments.map((a) => ({
            orgUnitId: a.orgUnitId,
            role: a.role,
            percentage: a.percentage != null ? String(a.percentage) : "",
          }))
        : [{ orgUnitId: orgUnits[0]?.id ?? "", role: "lead", percentage: "100" }]
    );
    setOpen(true);
  }

  const assignedRows = rows.filter((r) => r.role !== "supporter");
  const total = assignedRows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
  const leadCount = rows.filter((r) => r.role === "lead").length;
  const duplicateUnit = new Set(rows.map((r) => r.orgUnitId)).size !== rows.length;
  const canSave =
    rows.length === 0 || (Math.abs(total - 100) < 0.001 && leadCount === 1 && !duplicateUnit && rows.every((r) => r.orgUnitId !== ""));

  function submit() {
    const formData = new FormData();
    formData.set("initiativeId", initiative.id);
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

  const lead = initiative.assignments.find((a) => a.role === "lead");
  const participants = initiative.assignments.filter((a) => a.role === "participant");
  const supporters = initiative.assignments.filter((a) => a.role === "supporter");

  return (
    <div className="sru-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 240 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{initiative.titleAr}</h3>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{initiative.planName}</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12 }}>
              <Target size={12} aria-hidden style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
              {t("planTargetLabel")}: {initiative.planTargets.length > 0 ? initiative.planTargets.join("، ") : t("noTarget")}
            </span>
            <span style={{ fontSize: 12 }}>
              <Target size={12} aria-hidden style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
              {t("annualTargetLabel")}: {initiative.annualTargets.length > 0 ? initiative.annualTargets.join("، ") : t("noAnnualTarget")}
            </span>
          </div>
        </div>

        {canAssign && !open && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={startEditing}
              className={initiative.assignments.length > 0 ? "sru-icon-action" : "sru-btn sru-btn-primary"}
              title={initiative.assignments.length > 0 ? t("editAssignment") : undefined}
              aria-label={initiative.assignments.length > 0 ? t("editAssignment") : undefined}
            >
              {initiative.assignments.length > 0 ? (
                <Pencil size={15} aria-hidden />
              ) : (
                <>
                  <Plus size={15} aria-hidden />
                  {t("assignButton")}
                </>
              )}
            </button>
            {initiative.assignments.length > 0 && (
              <button
                type="button"
                className="sru-icon-action"
                title={t("clearAssignment")}
                aria-label={t("clearAssignment")}
                onClick={() => {
                  if (!window.confirm(t("clearConfirm"))) return;
                  const formData = new FormData();
                  formData.set("initiativeId", initiative.id);
                  formData.set("rows", "[]");
                  startTransition(() => formAction(formData));
                }}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {initiative.assignments.length > 0 && !open && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {lead && (
            <span className="pill" style={{ fontWeight: 700 }}>
              <Building2 size={12} aria-hidden style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
              {t("roleLead")}: {lead.orgUnitName} — {lead.percentage}%
            </span>
          )}
          {participants.map((p) => (
            <span key={p.orgUnitId} className="pill">
              {t("roleParticipant")}: {p.orgUnitName} — {p.percentage}%
            </span>
          ))}
          {supporters.map((s) => (
            <span key={s.orgUnitId} className="pill" style={{ opacity: 0.85 }}>
              {t("roleSupporter")}: {s.orgUnitName}
            </span>
          ))}
        </div>
      )}

      {open && (
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
                        onChange={(e) =>
                          setRows(rows.map((r, i) => (i === index ? { ...r, orgUnitId: e.target.value } : r)))
                        }
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
            <span style={{ fontSize: 13, fontWeight: 700, color: Math.abs(total - 100) < 0.001 ? "inherit" : "var(--sru-danger, #b91c1c)" }}>
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
            <button type="button" className="sru-btn" onClick={() => setOpen(false)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
