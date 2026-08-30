"use client";

import { useState, useTransition } from "react";
import { RowLink } from "@/components/RowLink";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteEvaluationCycle,
  type EvaluationCycleActionState,
} from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { cycleStatus, cycleStatusLabels } from "@/lib/evaluationCycle";
import { CycleEditDrawer } from "@/components/CycleEditDrawer";
import { formatDateDmy } from "@/lib/dateParts";

const errorKeys: Record<string, string> = {
  invalid_input: "manageErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "manageErrorForbidden",
  has_dependents: "manageErrorHasDependents",
  unknown: "manageErrorUnknown",
};

type CycleType = "academic" | "calendar" | "fiscal";

const cycleTypeLabelKeys: Record<CycleType, string> = {
  academic: "cycleTypeAcademic",
  calendar: "cycleTypeCalendar",
  fiscal: "cycleTypeFiscal",
};

export interface EvaluationCycleRowData {
  id: string;
  nameAr: string;
  nameEn: string | null;
  cycleType: CycleType;
  startDate: string;
  endDate: string;
  usageCount: number;
}

/**
 * One cycle row: read-only, plus a delete that is disabled outright while
 * anything still depends on the cycle.
 *
 * Editing moved out of the row entirely (2026-08-28, requested directly).
 * In place, a cell had to hold a date picker and a type select, which pushed
 * every other column aside and left the row looking like a form. The drawer
 * behind the weights cell is now the single place a cycle is changed.
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
  const [state, setState] = useState<EvaluationCycleActionState | null>(null);

  const status = cycleStatus(cycle.startDate, cycle.endDate, today);

  function run(fn: () => Promise<EvaluationCycleActionState>) {
    setState(null);
    startTransition(async () => {
      const result = await fn();
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <RowLink href={`/evaluations/cycles/${cycle.id}`}>
      <td>
        {cycle.nameAr}
        {cycle.nameEn && <div className="sru-name-en">{cycle.nameEn}</div>}
        {state?.status === "error" && (
          <div role="alert" className="text-sm text-red-600" style={{ marginTop: 4 }}>
            {t(errorKeys[state.message] ?? "manageErrorUnknown")}
          </div>
        )}
      </td>

      <td>{typeLabels[cycleTypeLabelKeys[cycle.cycleType]]}</td>
      <td>{formatDateDmy(cycle.startDate, locale)}</td>
      <td>{formatDateDmy(cycle.endDate, locale)}</td>

      <td>
        <span className="pill">{cycleStatusLabels[status]}</span>
      </td>
      <td className="sru-en">{cycle.usageCount}</td>

      <td className="no-print">
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <CycleEditDrawer cycle={cycle} canEdit={canManage} typeLabels={typeLabels} />
          {canManage && (
            <button
              type="button"
              className="sru-icon-action"
              title={
                cycle.usageCount > 0 ? t("deleteBlockedTitle", { count: cycle.usageCount }) : t("deleteButton")
              }
              aria-label={t("deleteButton")}
              disabled={pending || cycle.usageCount > 0}
              onClick={() => {
                if (!window.confirm(t("deleteConfirm"))) return;
                run(() => deleteEvaluationCycle(cycle.id));
              }}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </div>
      </td>
    </RowLink>
  );
}
