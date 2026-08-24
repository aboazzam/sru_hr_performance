"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Building2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import {
  saveInitiativeAssignments,
  type AssignmentActionState,
} from "@/app/[locale]/(app)/initiative-assignments/actions";
import {
  InitiativeAssignmentsEditor,
  type AssignmentRole,
  type AssignmentView,
} from "@/components/InitiativeAssignmentsEditor";

export type { AssignmentRole, AssignmentView };

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
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("assignedHeading", { count: assigned.length })}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("assignedIntro")}</p>
        {assigned.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("assignedEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {assigned.map((initiative) => (
              <InitiativeCard key={initiative.id} initiative={initiative} orgUnits={orgUnits} canAssign={canAssign} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("unassignedHeading", { count: unassigned.length })}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("unassignedIntro")}</p>
        {unassigned.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("unassignedEmpty")}</p>
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
  const startEditing = () => setOpen(true);

  // "Clear" writes an empty set through the same action the editor uses; it
  // is the one write the card still makes on its own.
  const [clearState, clearAction] = useActionState<AssignmentActionState, FormData>(saveInitiativeAssignments, null);
  useEffect(() => {
    if (clearState?.status === "success") router.refresh();
  }, [clearState, router]);

  const lead = initiative.assignments.find((a) => a.role === "lead");
  const participants = initiative.assignments.filter((a) => a.role === "participant");
  const supporters = initiative.assignments.filter((a) => a.role === "supporter");

  return (
    <div className="sru-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 240 }}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700 }}>{initiative.titleAr}</h3>
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 2 }}>{initiative.planName}</p>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11.5 }}>
              <Target size={12} aria-hidden style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
              {t("planTargetLabel")}: {initiative.planTargets.length > 0 ? initiative.planTargets.join("، ") : t("noTarget")}
            </span>
            <span style={{ fontSize: 11.5 }}>
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
                  startTransition(() => clearAction(formData));
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
        <InitiativeAssignmentsEditor
          initiativeId={initiative.id}
          assignments={initiative.assignments}
          orgUnits={orgUnits}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}
    </div>
  );
}
