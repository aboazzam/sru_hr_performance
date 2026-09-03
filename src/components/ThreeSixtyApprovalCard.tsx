"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { reviewThreeSixtyNominations, type ReviewNominationsState } from "@/app/[locale]/(app)/three-sixty/approvals/actions";

interface Row {
  id: string;
  relationshipCode: string;
  raterName: string;
  statusLabel: string;
  status: string;
  reviewNotes: string | null;
}

export function ThreeSixtyApprovalCard({
  cycleId,
  subjectId,
  subjectName,
  rows,
}: {
  cycleId: string;
  subjectId: string;
  subjectName: string;
  rows: Row[];
}) {
  const t = useTranslations("ThreeSixtyApprovalsPage");
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [state, formAction, pending] = useActionState<ReviewNominationsState, FormData>(
    reviewThreeSixtyNominations,
    null
  );

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  // The action only touches rows currently 'submitted' -- both buttons are
  // pointless (and would silently no-op server-side) once none remain.
  const hasSubmittedRows = rows.some((r) => r.status === "submitted");

  return (
    <div className="sru-card" style={{ marginBottom: 16, padding: 14 }}>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{subjectName}</p>
      <table className="admin-matrix" style={{ marginBottom: 10 }}>
        <thead>
          <tr>
            <th>{t("columnRelationship")}</th>
            <th>{t("columnRater")}</th>
            <th>{t("columnStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ fontFamily: "monospace", fontSize: 11 }}>{row.relationshipCode}</td>
              <td>{row.raterName}</td>
              <td>
                <span className="pill">{row.statusLabel}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.some((r) => r.reviewNotes) && (
        <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginBottom: 8 }}>
          {t("notesPrefix")} {rows.find((r) => r.reviewNotes)?.reviewNotes}
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="cycleId" value={cycleId} />
        <input type="hidden" name="subjectEmployeeId" value={subjectId} />
        <textarea
          name="notes"
          rows={2}
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            name="decision"
            value="approved"
            className="sru-btn sru-btn-primary"
            disabled={pending || !hasSubmittedRows}
          >
            {t("approveButton")}
          </button>
          <button type="submit" name="decision" value="returned" className="sru-btn" disabled={pending || !hasSubmittedRows}>
            {t("returnButton")}
          </button>
        </div>
      </form>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
          {t("errorGeneric")}
        </p>
      )}
    </div>
  );
}
