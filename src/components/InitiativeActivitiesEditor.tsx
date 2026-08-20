"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  deleteInitiativeActivity,
  saveInitiativeActivity,
  type ActivityActionState,
} from "@/app/[locale]/(app)/initiatives/[id]/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";

export interface ActivityView {
  id: string;
  titleAr: string;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  responsibleLabel: string;
  startDate: string | null;
  endDate: string | null;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  unknown: "errorUnknown",
};

/**
 * The "أبرز الأنشطة" editor beneath the card. It is deliberately separate
 * from the printed strip above it: the strip is what goes on paper, this is
 * where the owning department maintains it, and `no-print` keeps it off the
 * page when the card is printed.
 */
export function InitiativeActivitiesEditor({
  initiativeId,
  activities,
  employeeOptions,
}: {
  initiativeId: string;
  activities: ActivityView[];
  employeeOptions: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [responsibleKind, setResponsibleKind] = useState<"employee" | "name">("employee");
  const [state, formAction, pending] = useActionState<ActivityActionState, FormData>(saveInitiativeActivity, null);
  const [deleteState, deleteAction] = useActionState<ActivityActionState, FormData>(deleteInitiativeActivity, null);
  const [handled, setHandled] = useState<ActivityActionState>(null);

  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") {
      setStartDate("");
      setEndDate("");
    }
  }

  useEffect(() => {
    if (state?.status === "success" || deleteState?.status === "success") router.refresh();
  }, [state, deleteState, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    startTransition(() => formAction(formData));
    form.reset();
  }

  const activeError = state?.status === "error" ? state : deleteState?.status === "error" ? deleteState : null;

  return (
    <section className="no-print" style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t("activitiesEditorHeading")}</h2>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 12 }}>{t("activitiesEditorIntro")}</p>

      {activities.length > 0 && (
        <div className="sru-card" style={{ marginBottom: 14 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("activityColumn")}</th>
                  <th>{t("responsibleColumn")}</th>
                  <th>{t("periodColumn")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td>{activity.titleAr}</td>
                    <td>{activity.responsibleLabel}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {activity.startDate || activity.endDate ? `${activity.startDate ?? "—"} → ${activity.endDate ?? "—"}` : "—"}
                    </td>
                    <td>
                      <form action={(fd) => startTransition(() => deleteAction(fd))}>
                        <input type="hidden" name="activityId" value={activity.id} />
                        <button type="submit" className="sru-icon-action" title={t("deleteActivity")} aria-label={t("deleteActivity")}>
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input type="hidden" name="initiativeId" value={initiativeId} />
        <input type="hidden" name="startDate" value={startDate} />
        <input type="hidden" name="endDate" value={endDate} />
        <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="radio"
              name="responsibleKind"
              checked={responsibleKind === "employee"}
              onChange={() => setResponsibleKind("employee")}
            />
            {t("responsibleEmployee")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="radio" name="responsibleKind" checked={responsibleKind === "name"} onChange={() => setResponsibleKind("name")} />
            {t("responsibleWritten")}
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <div className="sru-field" style={{ minWidth: 300, flex: 1 }}>
            <label>{t("activityColumn")}</label>
            <input type="text" name="titleAr" required dir="rtl" />
          </div>
          {responsibleKind === "employee" ? (
            <div className="sru-field" style={{ minWidth: 220 }}>
              <label>{t("responsibleColumn")}</label>
              <select name="responsibleProfileId" defaultValue="">
                <option value="">{t("responsibleNone")}</option>
                {employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sru-field" style={{ minWidth: 220 }}>
              <label>{t("responsibleColumn")}</label>
              <input type="text" name="responsibleName" dir="rtl" />
            </div>
          )}
          <div className="sru-field" style={{ minWidth: 200 }}>
            <label>{t("startDateLabel")}</label>
            <DateFieldDmy value={startDate} onChange={setStartDate} />
          </div>
          <div className="sru-field" style={{ minWidth: 200 }}>
            <label>{t("endDateLabel")}</label>
            <DateFieldDmy value={endDate} onChange={setEndDate} />
          </div>
          <button type="submit" disabled={pending} className="sru-btn sru-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={15} aria-hidden />
            {pending ? t("savingActivity") : t("addActivity")}
          </button>
        </div>
      </form>

      {activeError && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[activeError.message] ?? "errorUnknown")}
        </p>
      )}
    </section>
  );
}
