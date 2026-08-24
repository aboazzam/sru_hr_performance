"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Eye, Pencil, Trash2 } from "lucide-react";
import {
  deleteInitiativeActivity,
  saveInitiativeActivity,
  type ActivityActionState,
} from "@/app/[locale]/(app)/initiatives/[id]/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { AddFormDialog } from "@/components/AddFormDialog";
import { formatDateDmy } from "@/lib/dateParts";
import type { ActivityView } from "@/components/InitiativeActivitiesEditor";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * One activity form, used by both the "add" dialog and each row's "edit"
 * dialog — the same row shape, so the two must not drift apart.
 *
 * `saveInitiativeActivity` already updates when it receives an `activityId`
 * and creates when it does not, so editing needed no new action.
 */
function ActivityForm({
  initiativeId,
  employeeOptions,
  activity,
  onSaved,
}: {
  initiativeId: string;
  employeeOptions: Array<{ id: string; label: string }>;
  /** Present when editing; absent when adding. */
  activity?: ActivityView;
  onSaved: () => void;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const [startDate, setStartDate] = useState(activity?.startDate ?? "");
  const [endDate, setEndDate] = useState(activity?.endDate ?? "");
  const [responsibleKind, setResponsibleKind] = useState<"employee" | "name">(
    activity?.responsibleName ? "name" : "employee"
  );
  const [state, formAction, pending] = useActionState<ActivityActionState, FormData>(saveInitiativeActivity, null);
  const [handled, setHandled] = useState<ActivityActionState>(null);

  // Derived during render, never in an effect (react-hooks/set-state-in-effect).
  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") onSaved();
  }

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      {activity && <input type="hidden" name="activityId" value={activity.id} />}
      <input type="hidden" name="startDate" value={startDate} />
      <input type="hidden" name="endDate" value={endDate} />

      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="radio"
            name="responsibleKind"
            checked={responsibleKind === "employee"}
            onChange={() => setResponsibleKind("employee")}
          />
          {t("responsibleEmployee")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="radio"
            name="responsibleKind"
            checked={responsibleKind === "name"}
            onChange={() => setResponsibleKind("name")}
          />
          {t("responsibleWritten")}
        </label>
      </div>

      <div className="sru-formgrid">
        <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
          <label>{t("activityColumn")}</label>
          <input type="text" name="titleAr" required dir="rtl" defaultValue={activity?.titleAr ?? ""} />
        </div>
        {responsibleKind === "employee" ? (
          <div className="sru-field">
            <label>{t("responsibleColumn")}</label>
            <select name="responsibleProfileId" defaultValue={activity?.responsibleProfileId ?? ""}>
              <option value="">{t("responsibleNone")}</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sru-field">
            <label>{t("responsibleColumn")}</label>
            <input type="text" name="responsibleName" dir="rtl" defaultValue={activity?.responsibleName ?? ""} />
          </div>
        )}
        <div className="sru-field">
          <label>{t("startDateLabel")}</label>
          <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("startDateLabel")} />
        </div>
        <div className="sru-field">
          <label>{t("endDateLabel")}</label>
          <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("endDateLabel")} />
        </div>
      </div>

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
          {pending ? t("savingActivity") : activity ? t("saveActivity") : t("addActivity")}
        </button>
      </div>
    </form>
  );
}

/**
 * "إضافة نشاط" — the primary button that sits on the timeline heading's own
 * row (2026-08-21 request), replacing the management form that used to sit
 * permanently under the card.
 */
export function InitiativeActivityAdd({
  initiativeId,
  employeeOptions,
}: {
  initiativeId: string;
  employeeOptions: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="sru-actionbar no-print" style={{ flex: "0 0 auto" }}>
      <AddFormDialog
        dialogRef={dialogRef}
        triggerLabel={t("addActivity")}
        heading={t("addActivity")}
        subtitle={t("activitiesEditorIntro")}
        closeLabel={t("closeButton")}
      >
        <ActivityForm
          initiativeId={initiativeId}
          employeeOptions={employeeOptions}
          onSaved={() => dialogRef.current?.close()}
        />
      </AddFormDialog>
    </div>
  );
}

/**
 * View / edit / delete beside one activity, the same three the initiative
 * cards carry — so the two lists behave alike.
 */
export function InitiativeActivityRowActions({
  initiativeId,
  activity,
  employeeOptions,
}: {
  initiativeId: string;
  activity: ActivityView;
  employeeOptions: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const locale = useLocale();
  const router = useRouter();
  const viewRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [deleteState, deleteAction] = useActionState<ActivityActionState, FormData>(deleteInitiativeActivity, null);

  useEffect(() => {
    if (deleteState?.status === "success") router.refresh();
  }, [deleteState, router]);

  const period =
    activity.startDate || activity.endDate
      ? `${activity.startDate ? formatDateDmy(activity.startDate, locale) : "—"} → ${
          activity.endDate ? formatDateDmy(activity.endDate, locale) : "—"
        }`
      : "—";

  return (
    <div className="sru-initiative-card-actions no-print">
      <button
        type="button"
        className="sru-icon-action"
        title={t("viewActivity")}
        aria-label={t("viewActivity")}
        onClick={() => viewRef.current?.showModal()}
      >
        <Eye size={15} aria-hidden />
      </button>
      <button
        type="button"
        className="sru-icon-action"
        title={t("editActivity")}
        aria-label={t("editActivity")}
        onClick={() => editRef.current?.showModal()}
      >
        <Pencil size={15} aria-hidden />
      </button>
      <form
        action={(fd) => {
          if (!window.confirm(t("deleteActivityConfirm"))) return;
          startTransition(() => deleteAction(fd));
        }}
      >
        <input type="hidden" name="activityId" value={activity.id} />
        <button type="submit" className="sru-icon-action" title={t("deleteActivity")} aria-label={t("deleteActivity")}>
          <Trash2 size={15} aria-hidden />
        </button>
      </form>

      {/* Read-only details, for a reader who only wants to look. */}
      <dialog
        ref={viewRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === viewRef.current) viewRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{activity.titleAr}</h3>
          <button type="button" className="sru-modal-close" onClick={() => viewRef.current?.close()} aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <dl style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", fontSize: 12 }}>
          <dt style={{ color: "var(--sru-muted)" }}>{t("responsibleColumn")}</dt>
          <dd style={{ fontWeight: 600 }}>{activity.responsibleLabel}</dd>
          <dt style={{ color: "var(--sru-muted)" }}>{t("periodColumn")}</dt>
          <dd style={{ fontWeight: 600 }}>{period}</dd>
        </dl>
      </dialog>

      <dialog
        ref={editRef}
        className="sru-modal"
        onClick={(e) => {
          if (e.target === editRef.current) editRef.current?.close();
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t("editActivity")}</h3>
          <button type="button" className="sru-modal-close" onClick={() => editRef.current?.close()} aria-label={t("closeButton")}>
            ×
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <ActivityForm
            initiativeId={initiativeId}
            employeeOptions={employeeOptions}
            activity={activity}
            onSaved={() => editRef.current?.close()}
          />
        </div>
      </dialog>
    </div>
  );
}
