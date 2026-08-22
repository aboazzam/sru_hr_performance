"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle } from "lucide-react";
import { RowLink } from "@/components/RowLink";
import { createProgram, type ProgramActionState } from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { AddFormDialog } from "@/components/AddFormDialog";

export interface ProgramSummary {
  id: string;
  nameAr: string;
  nameEn: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  initiativeCount: number;
  committeeCount: number;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/**
 * The برامج الاستراتيجية tab: programs belonging to one plan. Each row opens
 * its own page (three sub-tabs: committee / dashboard / detail), rather than
 * nesting tabs inside tabs.
 *
 * A committee member with no strategicPlanning grant reaches this list too —
 * strategic_programs_select lets membership alone grant read — but sees only
 * their own programs and no create form.
 */
export function ProgramsPanel({
  planId,
  programs,
  canManage,
  toolbar,
}: {
  planId: string;
  programs: ProgramSummary[];
  canManage: boolean;
  /** Export / import, shown beside "add" on one line — same as the
   *  initiatives tab, rather than a second row in a different size. */
  toolbar?: ReactNode;
}) {
  const t = useTranslations("ProgramsPanel");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [state, formAction, pending] = useActionState<ProgramActionState, FormData>(createProgram, null);
  const [handled, setHandled] = useState<ProgramActionState>(null);

  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") {
      setStartDate("");
      setEndDate("");
    }
  }

  useEffect(() => {
    if (state?.status === "success") {
      formRef.current?.reset();
      // Closed only on success: an error keeps the dialog open with its
      // message inside, rather than dropping the reader back to the list.
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, flex: 1, minWidth: 240 }}>{t("intro")}</p>
        {/* One row, one style: "add" sits beside export/import (2026-08-21). */}
        <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
        {canManage && (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addSubmit")}
            heading={t("addHeading")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="sru-formgrid">
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="startDate" value={startDate} />
                <input type="hidden" name="endDate" value={endDate} />
                <div className="sru-field">
                  <label>{t("nameArLabel")}</label>
                  <input type="text" name="nameAr" required dir="rtl" />
                </div>
                <div className="sru-field">
                  <label>{t("nameEnLabel")}</label>
                  <input type="text" name="nameEn" dir="ltr" style={{ textAlign: "left" }} />
                </div>
                <div className="sru-field">
                  <label>{t("statusLabel")}</label>
                  <input type="text" name="status" dir="rtl" placeholder={t("statusPlaceholder")} />
                </div>
                <div className="sru-field">
                  <label>{t("startDateLabel")}</label>
                  <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("startDateLabel")} />
                </div>
                <div className="sru-field">
                  <label>{t("endDateLabel")}</label>
                  <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("endDateLabel")} />
                </div>
                <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
                  <label>{t("descriptionLabel")}</label>
                  <textarea name="descriptionAr" rows={2} dir="rtl" />
                </div>
              </div>

              {state?.status === "error" && (
                <p role="alert" className="sru-auth-alert error">
                  <AlertCircle size={15} aria-hidden />
                  {t(errorKeys[state.message] ?? "errorUnknown")}
                </p>
              )}

              <div className="sru-form-submitrow">
                <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
                  {pending ? t("addSubmitting") : t("addSubmit")}
                </button>
              </div>
            </form>
          </AddFormDialog>
        )}
        {toolbar}
        </div>
      </div>

      {programs.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 20 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 24 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnPeriod")}</th>
                  <th>{t("columnInitiatives")}</th>
                  <th>{t("columnCommittee")}</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((program) => (
                  <RowLink key={program.id} href={`/kpis/plans/${planId}/programs/${program.id}`}>
                    <td>
                      <Link href={`/kpis/plans/${planId}/programs/${program.id}`} className="sru-row-link-title">
                        {program.nameAr}
                      </Link>
                      {program.nameEn && (
                        <span className="sru-name-en">
                          {program.nameEn}
                        </span>
                      )}
                    </td>
                    <td>{program.status}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {program.startDate || program.endDate ? `${program.startDate ?? "—"} → ${program.endDate ?? "—"}` : "—"}
                    </td>
                    <td>{program.initiativeCount}</td>
                    <td>{program.committeeCount}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
