"use client";

import { useMemo, useState, startTransition, useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Check, Plus, Trash2, X } from "lucide-react";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import {
  selectExecutivePlanTarget,
  unselectExecutivePlanTarget,
  saveTargetOrgUnits,
  type ExecutivePlanTargetState,
} from "@/app/[locale]/(app)/executive-plans/[id]/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  percentage_total: "errorPercentageTotal",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export interface PlanKpiRow {
  id: string;
  titleAr: string;
  titleEn: string | null;
  unitAr: string;
  planTargetValue: number | string | null;
  goalTitle: string | null;
  subGoalTitle: string | null;
  /** Present once the KPI has been pulled into this year's plan. */
  selected: {
    id: string;
    targetValue: number | string | null;
    actualValue: number | string | null;
    orgUnits: Array<{ orgUnitId: string; orgUnitName: string; percentage: number }>;
  } | null;
}

export interface OrgUnitOption {
  id: string;
  nameAr: string;
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The executive plan's targets tab: every KPI of the strategic plan on one
 * screen, with the year's selection and the split across colleges and
 * departments made in place.
 *
 * Asked for 2026-08-23. The whole list is shown — not only what is already
 * chosen — because the decision being made here is "which of these belong to
 * this year", and that cannot be made against a filtered list.
 *
 * The ring is achievement against THIS YEAR's target, not elapsed time: the
 * card that carries this plan already shows time as its own bar.
 */
export function ExecutivePlanTargetsPanel({
  executivePlanId,
  kpis,
  orgUnits,
  canManage,
}: {
  executivePlanId: string;
  kpis: PlanKpiRow[];
  orgUnits: OrgUnitOption[];
  canManage: boolean;
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const [showAll, setShowAll] = useState(false);

  const selectedCount = kpis.filter((k) => k.selected).length;
  const visible = showAll ? kpis : kpis.filter((k) => k.selected);

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>{t("targetsPickIntro")}</p>

      <div className="sru-filterbar no-print" style={{ marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={showAll} onChange={() => setShowAll((v) => !v)} />
          <span>{t("targetsShowAll", { total: kpis.length })}</span>
        </label>
        <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>
          {t("targetsSelectedCount", { count: selectedCount, total: kpis.length })}
        </span>
      </div>

      {visible.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>
          {kpis.length === 0 ? t("targetsNoKpis") : t("targetsNoneSelected")}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {visible.map((kpi) => (
            <TargetRow
              key={kpi.id}
              executivePlanId={executivePlanId}
              kpi={kpi}
              orgUnits={orgUnits}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetRow({
  executivePlanId,
  kpi,
  orgUnits,
  canManage,
}: {
  executivePlanId: string;
  kpi: PlanKpiRow;
  orgUnits: OrgUnitOption[];
  canManage: boolean;
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const router = useRouter();
  const [selectState, selectAction, selectPending] = useActionState<ExecutivePlanTargetState, FormData>(
    selectExecutivePlanTarget,
    null
  );
  const [removeState, removeAction] = useActionState<ExecutivePlanTargetState, FormData>(unselectExecutivePlanTarget, null);
  const [targetValue, setTargetValue] = useState(kpi.selected?.targetValue == null ? "" : String(kpi.selected.targetValue));

  useEffect(() => {
    if (selectState?.status === "success" || removeState?.status === "success") router.refresh();
  }, [selectState, removeState, router]);

  const target = num(kpi.selected?.targetValue);
  const actual = num(kpi.selected?.actualValue);
  const percent = target && target !== 0 && actual != null ? Math.round(Math.min(100, Math.max(0, (actual / target) * 100))) : 0;
  const measured = target != null && target !== 0 && actual != null;

  function submitSelection() {
    const formData = new FormData();
    formData.set("executivePlanId", executivePlanId);
    formData.set("strategicKpiId", kpi.id);
    formData.set("targetValue", targetValue);
    startTransition(() => selectAction(formData));
  }

  const state = selectState ?? removeState;

  return (
    <div className="sru-card sru-initiative-card" style={{ opacity: kpi.selected ? 1 : 0.72 }}>
      <div className="sru-initiative-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700 }}>{kpi.titleAr}</h4>
          {kpi.titleEn && <span className="sru-name-en">{kpi.titleEn}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {kpi.goalTitle && <span className="sru-initiative-chip is-plain">{kpi.goalTitle}</span>}
            {kpi.subGoalTitle && <span className="sru-initiative-chip is-plain">{kpi.subGoalTitle}</span>}
            <span className="sru-initiative-chip is-plain">
              {t("targetPlanValue", { value: kpi.planTargetValue == null ? "—" : String(kpi.planTargetValue), unit: kpi.unitAr })}
            </span>
          </div>

          {kpi.selected ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <div className="sru-field" style={{ maxWidth: 180 }}>
                  <label>{t("targetYearValueLabel")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={targetValue}
                    disabled={!canManage}
                    onChange={(e) => setTargetValue(e.target.value)}
                  />
                </div>
                {canManage && (
                  <button type="button" className="sru-btn" disabled={selectPending} onClick={submitSelection}>
                    {selectPending ? t("savingButton") : t("saveButton")}
                  </button>
                )}
              </div>

              <OrgUnitSplit
                targetId={kpi.selected.id}
                initialRows={kpi.selected.orgUnits}
                orgUnits={orgUnits}
                canManage={canManage}
              />
            </div>
          ) : (
            canManage && (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="sru-btn sru-btn-primary" disabled={selectPending} onClick={submitSelection}>
                  <Plus size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
                  {t("targetSelectButton")}
                </button>
              </div>
            )
          )}

          {state?.status === "error" && (
            <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
              <AlertCircle size={15} aria-hidden />
              {t(errorKeys[state.message] ?? "errorUnknown")}
            </p>
          )}
        </div>

        {kpi.selected && (
          <InitiativeProgressRing
            progress={{ percent, kind: measured ? "reported" : "none" }}
            caption={measured ? t("targetAchievementCaption") : t("targetNoActualCaption")}
          />
        )}

        {kpi.selected && canManage && (
          <div className="sru-initiative-card-actions">
            <button
              type="button"
              className="sru-icon-action"
              title={t("targetUnselectButton")}
              aria-label={t("targetUnselectButton")}
              onClick={() => {
                if (!window.confirm(t("targetUnselectConfirm"))) return;
                const formData = new FormData();
                formData.set("targetId", kpi.selected!.id);
                startTransition(() => removeAction(formData));
              }}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The split across colleges/departments. Edited as a whole set and saved in
 * one call, because the 100% rule is a property of the SET — saving a row at
 * a time would mean passing through states the rule forbids.
 */
function OrgUnitSplit({
  targetId,
  initialRows,
  orgUnits,
  canManage,
}: {
  targetId: string;
  initialRows: Array<{ orgUnitId: string; orgUnitName: string; percentage: number }>;
  orgUnits: OrgUnitOption[];
  canManage: boolean;
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const router = useRouter();
  const [rows, setRows] = useState(initialRows.map((r) => ({ orgUnitId: r.orgUnitId, percentage: String(r.percentage) })));
  const [state, formAction, pending] = useActionState<ExecutivePlanTargetState, FormData>(saveTargetOrgUnits, null);

  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0),
    [rows]
  );
  const duplicate = useMemo(() => new Set(rows.map((r) => r.orgUnitId)).size !== rows.length, [rows]);
  const complete = rows.every((r) => r.orgUnitId !== "" && Number(r.percentage) > 0);
  // The same rule the database enforces, shown before the save rather than
  // after it.
  const canSave = rows.length === 0 || (Math.abs(total - 100) < 0.001 && !duplicate && complete);

  if (!canManage && rows.length === 0) {
    return <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 10 }}>{t("targetNoUnits")}</p>;
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--sru-border)", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t("targetUnitsHeading")}</span>
        <span style={{ fontSize: 12, color: Math.abs(total - 100) < 0.001 || rows.length === 0 ? "var(--sru-muted)" : "var(--sru-danger, #b91c1c)" }}>
          {t("targetUnitsTotal", { total: String(total) })}
        </span>
      </div>

      {rows.length === 0 && !canManage && (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 6 }}>{t("targetNoUnits")}</p>
      )}

      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {rows.map((row, index) => (
          <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              value={row.orgUnitId}
              disabled={!canManage}
              onChange={(e) =>
                setRows((prev) => prev.map((r, i) => (i === index ? { ...r, orgUnitId: e.target.value } : r)))
              }
              style={{ flex: 1, minWidth: 180 }}
            >
              <option value="">{t("targetUnitPlaceholder")}</option>
              {orgUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameAr}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={row.percentage}
              disabled={!canManage}
              onChange={(e) =>
                setRows((prev) => prev.map((r, i) => (i === index ? { ...r, percentage: e.target.value } : r)))
              }
              style={{ width: 90 }}
              aria-label={t("targetUnitPercentageLabel")}
            />
            <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>%</span>
            {canManage && (
              <button
                type="button"
                className="sru-icon-action"
                title={t("targetUnitRemove")}
                aria-label={t("targetUnitRemove")}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="sru-btn"
            onClick={() => setRows((prev) => [...prev, { orgUnitId: "", percentage: "" }])}
          >
            <Plus size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
            {t("targetUnitAdd")}
          </button>
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={!canSave || pending}
            onClick={() => {
              const formData = new FormData();
              formData.set("targetId", targetId);
              formData.set(
                "rows",
                JSON.stringify(rows.map((r) => ({ orgUnitId: r.orgUnitId, percentage: Number(r.percentage) })))
              );
              startTransition(() => formAction(formData));
            }}
          >
            <Check size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
            {pending ? t("savingButton") : t("targetUnitsSave")}
          </button>
        </div>
      )}

      {state?.status === "error" && (
        <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[state.message] ?? "errorUnknown")}
        </p>
      )}
    </div>
  );
}
