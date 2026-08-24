"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import { initiativeProgress } from "@/lib/initiativeProgress";
import { formatDateDmy } from "@/lib/dateParts";
import { deleteProgram } from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";
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
  descriptionAr: string | null;
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
  locale,
  toolbar,
}: {
  planId: string;
  programs: ProgramSummary[];
  canManage: boolean;
  locale: string;
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
        <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, flex: 1, minWidth: 240 }}>{t("intro")}</p>
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
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 20 }}>{t("empty")}</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
          {programs.map((program) => (
            <ProgramCard key={program.id} planId={planId} program={program} canManage={canManage} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One program, shaped like an initiative card (2026-08-22: "افعل في بطاقة
 * البرنامج مثل ما فعلنا في بطاقة المبادرة").
 *
 * The ring reuses the initiatives' own progress helper and component. A
 * program has no reported percentage column, so what it can honestly show is
 * elapsed time against its period — which is exactly the case that helper
 * already labels as time rather than passing it off as completion.
 */
function ProgramCard({
  planId,
  program,
  canManage,
  locale,
}: {
  planId: string;
  program: ProgramSummary;
  canManage: boolean;
  locale: string;
}) {
  const t = useTranslations("ProgramsPanel");
  const router = useRouter();
  const [, deleteAction] = useActionState<ProgramActionState, FormData>(deleteProgram, null);
  const href = `/kpis/plans/${planId}/programs/${program.id}`;

  const progress = initiativeProgress(
    { startDate: program.startDate, endDate: program.endDate },
    new Date().toISOString().slice(0, 10)
  );
  const startText = program.startDate ? formatDateDmy(program.startDate, locale) : "—";
  const endText = program.endDate ? formatDateDmy(program.endDate, locale) : "—";
  const period = program.startDate || program.endDate ? `${startText} → ${endText}` : null;

  return (
    <div className="sru-card sru-initiative-card">
      <div className="sru-initiative-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 13.5, fontWeight: 700 }}>
            <Link href={href} className="sru-stretched sru-initiative-card-title">
              {program.nameAr}
              <ArrowLeft size={14} aria-hidden className="sru-initiative-card-go" />
            </Link>
          </h4>
          {program.nameEn && <span className="sru-name-en">{program.nameEn}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span className="sru-initiative-chip">{program.status}</span>
            {period && <span className="sru-initiative-chip is-plain">{period}</span>}
            <span className="sru-initiative-chip is-plain">
              {t("chipInitiatives", { count: program.initiativeCount })}
            </span>
            <span className="sru-initiative-chip is-plain">
              {t("chipCommittee", { count: program.committeeCount })}
            </span>
          </div>
        </div>
        {/* After the text, so in an RTL row it renders on the LEFT. */}
        <InitiativeProgressRing progress={progress} />
        <div className="sru-initiative-card-actions">
          <Link href={href} className="sru-icon-action" title={t("viewButton")} aria-label={t("viewButton")}>
            <Eye size={15} aria-hidden />
          </Link>
          {canManage && (
            <>
              {/* The program's own record is edited in its info tab — one
                  editor, reached from here, not a second copy on the card. */}
              <Link
                href={`${href}#info`}
                className="sru-icon-action"
                title={t("editButton")}
                aria-label={t("editButton")}
              >
                <Pencil size={15} aria-hidden />
              </Link>
              <form
                action={(formData) => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  startTransition(() => {
                    deleteAction(formData);
                    router.refresh();
                  });
                }}
              >
                <input type="hidden" name="programId" value={program.id} />
                <button type="submit" className="sru-icon-action" title={t("deleteButton")} aria-label={t("deleteButton")}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {program.descriptionAr && (
        <p style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>{program.descriptionAr}</p>
      )}
    </div>
  );
}
