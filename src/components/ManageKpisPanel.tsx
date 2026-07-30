"use client";

import { useActionState, useState, useTransition, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Gauge, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { createKpi, deleteKpi, setKpiAnnualTarget, type KpiActionState } from "@/app/[locale]/(app)/kpis/manage-kpis/actions";

export interface KpiItem {
  id: string;
  title_ar: string;
  title_en: string | null;
  unit_ar: string;
  unit_en: string | null;
  plan_target_value: number | null;
  weight: number | null;
}

export interface CycleItem {
  id: string;
  name_ar: string;
}

export interface AnnualTargetItem {
  kpi_id: string;
  cycle_id: string;
  target_value: number;
  actual_value: number | null;
}

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

/** One row per (KPI, cycle): the "مستهدف سنوي" and its achieved value. */
function AnnualTargetRow({
  kpiId,
  cycle,
  existing,
  canEdit,
}: {
  kpiId: string;
  cycle: CycleItem;
  existing: AnnualTargetItem | undefined;
  canEdit: boolean;
}) {
  const t = useTranslations("ManageKpisPage");
  const router = useRouter();
  const [isSaving, start] = useTransition();
  const [target, setTarget] = useState(existing ? String(existing.target_value) : "");
  const [actual, setActual] = useState(existing?.actual_value != null ? String(existing.actual_value) : "");
  const [error, setError] = useState<string | null>(null);

  // Saved baseline, so Save stays inactive until something really changed --
  // the same dirty-tracking pattern established in EditRoleForm.
  const [savedTarget, setSavedTarget] = useState(target);
  const [savedActual, setSavedActual] = useState(actual);
  const isDirty = target !== savedTarget || actual !== savedActual;

  function handleSave() {
    setError(null);
    start(async () => {
      const res = await setKpiAnnualTarget(kpiId, cycle.id, target, actual);
      if (res.status === "success") {
        setSavedTarget(target);
        setSavedActual(actual);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <tr>
      <td>{cycle.name_ar}</td>
      <td>
        <input
          type="number"
          step="0.01"
          value={target}
          disabled={!canEdit}
          onChange={(e) => setTarget(e.target.value)}
          aria-label={t("annualTargetLabel")}
          style={{ width: 100, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
        />
      </td>
      <td>
        <input
          type="number"
          step="0.01"
          value={actual}
          disabled={!canEdit}
          onChange={(e) => setActual(e.target.value)}
          aria-label={t("annualActualLabel")}
          style={{ width: 100, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)" }}
        />
      </td>
      <td>
        {canEdit && (
          <button
            type="button"
            className="sru-btn"
            disabled={isSaving || !isDirty || target === ""}
            onClick={handleSave}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {isSaving ? t("saving") : t("saveButton")}
          </button>
        )}
        {error && (
          <span role="alert" style={{ fontSize: 11, color: "#b91c1c", marginInlineStart: 6 }}>
            {t(errorMessageKeys[error] ?? "errorUnknown")}
          </span>
        )}
      </td>
    </tr>
  );
}

export function ManageKpisPanel({
  parentKind,
  parentId,
  kpis,
  cycles,
  annualTargets,
  canEdit,
}: {
  parentKind: "goal" | "subGoal";
  parentId: string;
  kpis: KpiItem[];
  cycles: CycleItem[];
  annualTargets: AnnualTargetItem[];
  canEdit: boolean;
}) {
  const t = useTranslations("ManageKpisPage");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<KpiActionState | null, FormData>(createKpi, null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  // See EmployeeInviteForm.tsx: React 19's <form action={fn}> resets every
  // uncontrolled field after ANY submission, success or error alike.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  function handleDelete(kpiId: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleteError(null);
    setDeletingId(kpiId);
    startDeleting(async () => {
      const res = await deleteKpi(kpiId);
      if (res.status === "success") {
        router.refresh();
      } else {
        setDeleteError(res.message);
      }
      setDeletingId(null);
    });
  }

  return (
    <>
      {kpis.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 24 }}>{t("empty")}</p>
      ) : (
        kpis.map((kpi) => (
          <section key={kpi.id} className="sru-formsection">
            <div className="sru-formsection-head">
              <span className="sru-formsection-badge">
                <Gauge size={17} aria-hidden />
              </span>
              <div style={{ flex: 1 }}>
                <h3>{kpi.title_ar}</h3>
                <span>
                  {t("unitLabel")}: {kpi.unit_ar}
                  {kpi.plan_target_value != null ? ` · ${t("planTargetLabel")}: ${kpi.plan_target_value}` : ""}
                  {kpi.weight != null ? ` · ${t("weightLabel")}: ${kpi.weight}%` : ""}
                </span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="sru-icon-action danger"
                  title={t("deleteButton")}
                  aria-label={t("deleteButton")}
                  disabled={isDeleting && deletingId === kpi.id}
                  onClick={() => handleDelete(kpi.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("annualTargetsHeading")}</h4>
            {cycles.length === 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{t("noCycles")}</p>
            ) : (
              <div className="table-scroll" style={{ marginBottom: 12 }}>
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("columnCycle")}</th>
                      <th>{t("columnAnnualTarget")}</th>
                      <th>{t("columnAnnualActual")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((cycle) => (
                      <AnnualTargetRow
                        key={`${kpi.id}-${cycle.id}`}
                        kpiId={kpi.id}
                        cycle={cycle}
                        existing={annualTargets.find((a) => a.kpi_id === kpi.id && a.cycle_id === cycle.id)}
                        canEdit={canEdit}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}

      {deleteError && (
        <p role="alert" className="sru-auth-alert error">
          <AlertCircle size={15} aria-hidden />
          {t(errorMessageKeys[deleteError] ?? "errorUnknown")}
        </p>
      )}

      {canEdit && (
        <form onSubmit={handleSubmit}>
          <input type="hidden" name={parentKind === "goal" ? "goalId" : "subGoalId"} value={parentId} />
          <section className="sru-formsection">
            <div className="sru-formsection-head">
              <span className="sru-formsection-badge">
                <Gauge size={17} aria-hidden />
              </span>
              <div>
                <h3>{t("addHeading")}</h3>
                <span>{t("addSubtitle")}</span>
              </div>
            </div>
            <div className="sru-formgrid">
              <div className="sru-field">
                <label>{t("titleArLabel")}</label>
                <input type="text" name="titleAr" required dir="rtl" placeholder={t("titleArPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("titleEnLabel")}</label>
                <input type="text" name="titleEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("titleEnPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("unitArLabel")}</label>
                <input type="text" name="unitAr" required dir="rtl" placeholder={t("unitArPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("unitEnLabel")}</label>
                <input type="text" name="unitEn" dir="ltr" style={{ textAlign: "left" }} placeholder={t("unitEnPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("planTargetFieldLabel")}</label>
                <input type="number" name="planTargetValue" step="0.01" placeholder={t("planTargetPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("weightFieldLabel")}</label>
                <input type="number" name="weight" min="0.01" max="100" step="0.01" placeholder={t("weightPlaceholder")} />
              </div>
            </div>
          </section>

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error">
              <AlertCircle size={15} aria-hidden />
              {t(errorMessageKeys[state.message] ?? "errorUnknown")}
            </p>
          )}
          {state?.status === "success" && (
            <p role="status" className="sru-auth-alert success">
              <CheckCircle2 size={15} aria-hidden />
              {t("successMessage")}
            </p>
          )}

          <div className="sru-form-submitrow">
            <button type="submit" disabled={pending} className="sru-btn sru-btn-primary">
              {pending ? t("submitting") : t("submit")}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
