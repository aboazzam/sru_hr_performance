"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Pencil } from "lucide-react";
import { updateProgram, type ProgramActionState } from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export interface ProgramInfo {
  id: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  initiativeCount: number;
  committeeCount: number;
  period: string;
}

/**
 * The program's own record: read-only by default, with one editor behind a
 * pencil for callers who clear `strategicPlanning='approve'` — the level
 * `strategic_programs_update` itself requires, so this is the one place the
 * record is edited and the card's edit icon links straight here.
 *
 * A committee member reaches this page through membership alone and sees the
 * information without the pencil; the action would refuse them anyway (it
 * reads the affected rows back, so an RLS-blocked update reports "forbidden"
 * rather than a silent success).
 */
export function ProgramInfoPanel({ info, canManage }: { info: ProgramInfo; canManage: boolean }) {
  const t = useTranslations("ProgramDetailPage");
  const tPanel = useTranslations("ProgramsPanel");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [startDate, setStartDate] = useState(info.startDate ?? "");
  const [endDate, setEndDate] = useState(info.endDate ?? "");
  const [state, formAction, pending] = useActionState<ProgramActionState, FormData>(updateProgram, null);

  // Derived during render, not in an effect: this repo forbids setState
  // inside useEffect (react-hooks/set-state-in-effect), and closing the
  // editor is a reaction to a value change, not a sync with the outside.
  const [handled, setHandled] = useState<ProgramActionState>(null);
  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") setEditing(false);
  }

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (!editing) {
    const rows: Array<[string, string]> = [
      [t("fieldNameAr"), info.nameAr],
      [t("fieldNameEn"), info.nameEn ?? t("notSet")],
      [t("fieldStatus"), info.status],
      [t("fieldPeriod"), info.period],
      [t("fieldDescription"), info.descriptionAr ?? t("notSet")],
      [t("fieldInitiativeCount"), String(info.initiativeCount)],
      [t("fieldCommitteeCount"), String(info.committeeCount)],
    ];
    return (
      <div className="sru-card">
        {canManage && (
          <div className="sru-actionbar no-print" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
            <button type="button" className="sru-btn sru-btn-primary" onClick={() => setEditing(true)}>
              <Pencil size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
              {tPanel("editButton")}
            </button>
          </div>
        )}
        <div className="table-scroll">
          <table className="admin-matrix">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th style={{ width: "32%" }}>{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="sru-card">
      <form ref={formRef} onSubmit={handleSubmit}>
        <input type="hidden" name="programId" value={info.id} />
        <input type="hidden" name="startDate" value={startDate} />
        <input type="hidden" name="endDate" value={endDate} />
        <div className="sru-formgrid">
          <div className="sru-field">
            <label>{t("fieldNameAr")}</label>
            <input type="text" name="nameAr" required dir="rtl" defaultValue={info.nameAr} />
          </div>
          <div className="sru-field">
            <label>{t("fieldNameEn")}</label>
            <input type="text" name="nameEn" dir="ltr" style={{ textAlign: "left" }} defaultValue={info.nameEn ?? ""} />
          </div>
          <div className="sru-field">
            <label>{t("fieldStatus")}</label>
            <input type="text" name="status" dir="rtl" defaultValue={info.status} />
          </div>
          <div className="sru-field">
            <label>{tPanel("startDateLabel")}</label>
            <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={tPanel("startDateLabel")} />
          </div>
          <div className="sru-field">
            <label>{tPanel("endDateLabel")}</label>
            <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={tPanel("endDateLabel")} />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("fieldDescription")}</label>
            <textarea name="descriptionAr" rows={3} dir="rtl" defaultValue={info.descriptionAr ?? ""} />
          </div>
        </div>

        {state?.status === "error" && (
          <p role="alert" className="sru-auth-alert error">
            <AlertCircle size={15} aria-hidden />
            {tPanel(errorKeys[state.message] ?? "errorUnknown")}
          </p>
        )}

        <div className="sru-form-submitrow" style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
            {pending ? tPanel("addSubmitting") : tPanel("saveButton")}
          </button>
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setStartDate(info.startDate ?? "");
              setEndDate(info.endDate ?? "");
              setEditing(false);
            }}
          >
            {tPanel("cancelButton")}
          </button>
        </div>
      </form>
    </div>
  );
}
