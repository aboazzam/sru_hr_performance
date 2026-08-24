"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  InitiativeAssignmentsEditor,
  type AssignmentView,
} from "@/components/InitiativeAssignmentsEditor";

/**
 * الجهات المشاركة, in the same shape as the activities list: a read-only row
 * per department with icons beside it, and one primary button on the
 * heading's own row (2026-08-21 request).
 *
 * **Why every icon opens the same editor rather than acting on its own row:**
 * the assignment set is saved as ONE transaction — `save_initiative_assignments`
 * refuses anything that is not exactly 100% across the assigned units with a
 * single lead. So a per-row delete would, most of the time, submit a set the
 * database is bound to reject. Instead each icon opens the set editor with
 * that change already staged (row removed, or a blank row appended), leaving
 * the reader to rebalance and save — the rule is respected instead of being
 * discovered as an error.
 */
export function InitiativeAssignmentsSection({
  initiativeId,
  assignments,
  orgUnits,
}: {
  initiativeId: string;
  assignments: AssignmentView[];
  orgUnits: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("InitiativeAssignmentsPage");
  const tCard = useTranslations("InitiativePage");
  const dialogRef = useRef<HTMLDialogElement>(null);
  // What the editor opens with, and a key so it starts from that each time.
  const [staged, setStaged] = useState<AssignmentView[]>(assignments);
  const [openCount, setOpenCount] = useState(0);

  function open(next: AssignmentView[]) {
    setStaged(next);
    setOpenCount((n) => n + 1);
    dialogRef.current?.showModal();
  }

  const roleLabel = (role: AssignmentView["role"]) =>
    role === "lead" ? t("roleLead") : role === "participant" ? t("roleParticipant") : t("roleSupporter");

  return (
    <section className="sru-formsection no-print" style={{ marginTop: 16 }}>
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Building2 size={17} aria-hidden />
        </span>
        <div style={{ flex: 1 }}>
          <h3>{t("formHeading")}</h3>
          <span>{t("formNote")}</span>
        </div>
        <button
          type="button"
          className="sru-btn sru-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
          onClick={() => open([...assignments, { orgUnitId: "", orgUnitName: "", role: "participant", percentage: null }])}
        >
          <Plus size={15} aria-hidden />
          {t("addUnitRow")}
        </button>
      </div>

      {assignments.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{tCard("assignmentsNone")}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {assignments.map((a) => (
            <li
              key={a.orgUnitId}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12 }}
            >
              <span>
                <strong>{a.orgUnitName}</strong>
                <span style={{ color: "var(--sru-muted)" }}>
                  {" — "}
                  {roleLabel(a.role)}
                  {a.percentage != null ? ` · ${a.percentage}%` : ` · ${t("noPercentage")}`}
                </span>
              </span>
              <span className="sru-initiative-card-actions">
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("editAssignment")}
                  aria-label={t("editAssignment")}
                  onClick={() => open(assignments)}
                >
                  <Pencil size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("removeRow")}
                  aria-label={t("removeRow")}
                  onClick={() => open(assignments.filter((x) => x.orgUnitId !== a.orgUnitId))}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="sru-modal"
        style={{ width: "min(760px, calc(100vw - 32px))" }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("formHeading")}</h3>
          <button
            type="button"
            className="sru-modal-close"
            onClick={() => dialogRef.current?.close()}
            aria-label={tCard("closeButton")}
          >
            ×
          </button>
        </div>
        <InitiativeAssignmentsEditor
          key={openCount}
          initiativeId={initiativeId}
          assignments={staged}
          orgUnits={orgUnits}
          onSaved={() => dialogRef.current?.close()}
        />
      </dialog>
    </section>
  );
}
