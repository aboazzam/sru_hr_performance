"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Pencil, Save, X, Trash2 } from "lucide-react";
import {
  updateEvaluationCycle,
  deleteEvaluationCycle,
  type EvaluationCycleActionState,
} from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { cycleStatus, cycleStatusLabels } from "@/lib/evaluationCycle";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { formatDateDmy } from "@/lib/dateParts";

const errorKeys: Record<string, string> = {
  invalid_input: "manageErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "manageErrorForbidden",
  has_dependents: "manageErrorHasDependents",
  unknown: "manageErrorUnknown",
};

const cycleTypes = ["academic", "calendar", "fiscal"] as const;
const cycleTypeLabelKeys: Record<(typeof cycleTypes)[number], string> = {
  academic: "cycleTypeAcademic",
  calendar: "cycleTypeCalendar",
  fiscal: "cycleTypeFiscal",
};

export interface EvaluationCycleRowData {
  id: string;
  nameAr: string;
  nameEn: string | null;
  cycleType: (typeof cycleTypes)[number];
  startDate: string;
  endDate: string;
  usageCount: number;
}

/**
 * One cycle row: read-only by default with an explicit edit toggle (the same
 * view/edit shape used by the org-structure rows and the recruitment-plan
 * items), plus a delete that is disabled outright while anything still
 * depends on the cycle.
 */
export function EvaluationCycleRow({
  cycle,
  canManage,
  today,
  typeLabels,
}: {
  cycle: EvaluationCycleRowData;
  canManage: boolean;
  /** YYYY-MM-DD in the configured display timezone, computed on the server. */
  today: string;
  typeLabels: Record<string, string>;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<EvaluationCycleActionState | null>(null);

  const [nameAr, setNameAr] = useState(cycle.nameAr);
  const [nameEn, setNameEn] = useState(cycle.nameEn ?? "");
  const [cycleType, setCycleType] = useState<string>(cycle.cycleType);
  const [startDate, setStartDate] = useState(cycle.startDate);
  const [endDate, setEndDate] = useState(cycle.endDate);

  const status = cycleStatus(cycle.startDate, cycle.endDate, today);
  const dirty =
    nameAr !== cycle.nameAr ||
    nameEn !== (cycle.nameEn ?? "") ||
    cycleType !== cycle.cycleType ||
    startDate !== cycle.startDate ||
    endDate !== cycle.endDate;

  function reset() {
    setNameAr(cycle.nameAr);
    setNameEn(cycle.nameEn ?? "");
    setCycleType(cycle.cycleType);
    setStartDate(cycle.startDate);
    setEndDate(cycle.endDate);
    setState(null);
    setEditing(false);
  }

  function run(fn: () => Promise<EvaluationCycleActionState>, closeEditor = false) {
    setState(null);
    startTransition(async () => {
      const result = await fn();
      setState(result);
      if (result.status === "success") {
        if (closeEditor) setEditing(false);
        router.refresh();
      }
    });
  }

  return (
    <tr>
      <td>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            <input value={nameEn} dir="ltr" onChange={(e) => setNameEn(e.target.value)} placeholder="English name" />
          </div>
        ) : (
          <>
            {cycle.nameAr}
            {cycle.nameEn && (
              <div className="sru-en" style={{ color: "var(--sru-muted)", fontSize: 12 }}>
                {cycle.nameEn}
              </div>
            )}
          </>
        )}
        {state?.status === "error" && (
          <div role="alert" className="text-sm text-red-600" style={{ marginTop: 4 }}>
            {t(errorKeys[state.message] ?? "manageErrorUnknown")}
          </div>
        )}
      </td>

      <td>
        {editing ? (
          <select value={cycleType} onChange={(e) => setCycleType(e.target.value)}>
            {cycleTypes.map((type) => (
              <option key={type} value={type}>
                {typeLabels[cycleTypeLabelKeys[type]]}
              </option>
            ))}
          </select>
        ) : (
          typeLabels[cycleTypeLabelKeys[cycle.cycleType]]
        )}
      </td>

      <td className="sru-en">
        {editing ? (
          <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("columnStartDate")} />
        ) : (
          formatDateDmy(cycle.startDate, locale)
        )}
      </td>
      <td className="sru-en">
        {editing ? (
          <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("columnEndDate")} />
        ) : (
          formatDateDmy(cycle.endDate, locale)
        )}
      </td>

      <td>
        <span className="pill">{cycleStatusLabels[status]}</span>
      </td>
      <td className="sru-en">{cycle.usageCount}</td>

      <td className="no-print">
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href={`/evaluations/new?cycleId=${cycle.id}`}
            className="sru-btn"
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            {t("createEvaluation")}
          </Link>

          {canManage &&
            (editing ? (
              <>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("saveButton")}
                  aria-label={t("saveButton")}
                  disabled={pending || !dirty}
                  onClick={() =>
                    run(
                      () =>
                        updateEvaluationCycle({
                          cycleId: cycle.id,
                          nameAr,
                          nameEn: nameEn.trim() === "" ? null : nameEn,
                          cycleType,
                          startDate,
                          endDate,
                        }),
                      true
                    )
                  }
                >
                  <Save size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("cancelButton")}
                  aria-label={t("cancelButton")}
                  disabled={pending}
                  onClick={reset}
                >
                  <X size={15} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("editButton")}
                  aria-label={t("editButton")}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={cycle.usageCount > 0 ? t("deleteBlockedTitle", { count: cycle.usageCount }) : t("deleteButton")}
                  aria-label={t("deleteButton")}
                  disabled={pending || cycle.usageCount > 0}
                  onClick={() => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    run(() => deleteEvaluationCycle(cycle.id));
                  }}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </>
            ))}
        </div>
      </td>
    </tr>
  );
}
