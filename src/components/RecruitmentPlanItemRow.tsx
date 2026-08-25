"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Pencil, Trash2, Save, X, Megaphone } from "lucide-react";
import {
  updateRecruitmentPlanItem,
  deleteRecruitmentPlanItem,
  publishPlanItemAsVacancy,
  type RecruitmentPlanActionState,
} from "@/app/[locale]/(app)/recruitment/plan/actions";
import {
  recruitmentQuarters,
  recruitmentQuarterLabels,
  recruitmentPriorities,
  recruitmentPriorityLabels,
  recruitmentItemStatuses,
  recruitmentItemStatusLabel,
  recruitmentItemStatusLabels,
} from "@/lib/recruitmentPlan";
import type { Locale } from "@/i18n/config";

const errorKeys: Record<string, string> = {
  invalid_input: "errorItemNeedsJobTitle",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  not_found: "errorNotFound",
  already_posted: "errorAlreadyPosted",
  duplicate: "errorDuplicateItem",
  unknown: "errorUnknown",
};

export interface RecruitmentPlanItemView {
  id: string;
  jobTitleName: string | null;
  gradeLevel: number | null;
  positionName: string | null;
  orgUnitName: string | null;
  headcount: number;
  targetQuarter: number | null;
  priority: string | null;
  estimatedMonthlyCost: number | null;
  justification: string | null;
  status: string;
  hasVacancy: boolean;
}

/**
 * One plan item: read-only by default with an explicit edit toggle (the same
 * view/edit shape used by the org-structure position rows, after the project
 * owner reported always-editable inputs read as unclear).
 */
export function RecruitmentPlanItemRow({
  item,
  canPrepare,
  locale,
}: {
  item: RecruitmentPlanItemView;
  canPrepare: boolean;
  locale: Locale;
}) {
  const t = useTranslations("RecruitmentPlanPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<RecruitmentPlanActionState | null>(null);

  const [headcount, setHeadcount] = useState(String(item.headcount));
  const [quarter, setQuarter] = useState(item.targetQuarter ? String(item.targetQuarter) : "");
  const [priority, setPriority] = useState(item.priority ?? "");
  const [cost, setCost] = useState(item.estimatedMonthlyCost != null ? String(item.estimatedMonthlyCost) : "");
  const [status, setStatus] = useState(item.status);
  const [justification, setJustification] = useState(item.justification ?? "");

  const format = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US");

  function reset() {
    setHeadcount(String(item.headcount));
    setQuarter(item.targetQuarter ? String(item.targetQuarter) : "");
    setPriority(item.priority ?? "");
    setCost(item.estimatedMonthlyCost != null ? String(item.estimatedMonthlyCost) : "");
    setStatus(item.status);
    setJustification(item.justification ?? "");
    setState(null);
    setEditing(false);
  }

  function run(fn: () => Promise<RecruitmentPlanActionState>, closeEditor = false) {
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

  const save = () =>
    run(
      () =>
        updateRecruitmentPlanItem({
          itemId: item.id,
          headcount: Number(headcount),
          targetQuarter: quarter ? Number(quarter) : null,
          priority: priority ? priority : null,
          estimatedMonthlyCost: cost.trim() === "" ? null : Number(cost),
          status,
          justification: justification.trim() === "" ? null : justification,
        }),
      true
    );

  const remove = () => {
    if (!window.confirm(t("deleteItemConfirm"))) return;
    run(() => deleteRecruitmentPlanItem(item.id));
  };

  const publish = () => {
    if (!window.confirm(t("publishConfirm"))) return;
    run(() => publishPlanItemAsVacancy(item.id));
  };

  return (
    <tr>
      <td>
        {item.jobTitleName ?? t("noJobTitle")}
        {item.gradeLevel != null && (
          <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
            {t("gradeLabel", { grade: item.gradeLevel })}
          </span>
        )}
        {item.positionName && (
          <div style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 2 }}>
            {t("fromPosition", { position: item.positionName })}
          </div>
        )}
        {state?.status === "error" && (
          <div role="alert" className="text-sm text-red-600" style={{ marginTop: 4 }}>
            {t(errorKeys[state.message] ?? "errorUnknown")}
          </div>
        )}
      </td>
      <td>{item.orgUnitName ?? "—"}</td>

      <td>
        {editing ? (
          <input
            type="number"
            min={1}
            dir="ltr"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            style={{ width: 70 }}
          />
        ) : (
          format(item.headcount)
        )}
      </td>

      <td>
        {editing ? (
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="">—</option>
            {recruitmentQuarters.map((q) => (
              <option key={q} value={q}>
                {recruitmentQuarterLabels[q]}
              </option>
            ))}
          </select>
        ) : item.targetQuarter ? (
          recruitmentQuarterLabels[item.targetQuarter as 1 | 2 | 3 | 4]
        ) : (
          "—"
        )}
      </td>

      <td>
        {editing ? (
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">—</option>
            {recruitmentPriorities.map((p) => (
              <option key={p} value={p}>
                {recruitmentPriorityLabels[p]}
              </option>
            ))}
          </select>
        ) : item.priority ? (
          recruitmentPriorityLabels[item.priority as "high" | "medium" | "low"] ?? item.priority
        ) : (
          "—"
        )}
      </td>

      <td>
        {editing ? (
          <input
            type="number"
            min={0}
            step="0.01"
            dir="ltr"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            style={{ width: 110 }}
          />
        ) : item.estimatedMonthlyCost != null ? (
          format(item.estimatedMonthlyCost)
        ) : (
          "—"
        )}
      </td>

      <td>
        {editing ? (
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {recruitmentItemStatuses.map((s) => (
              <option key={s} value={s}>
                {recruitmentItemStatusLabels[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className="pill">{recruitmentItemStatusLabel(item.status)}</span>
        )}
      </td>

      {canPrepare && (
        <td>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {editing ? (
              <>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("saveButton")}
                  aria-label={t("saveButton")}
                  disabled={pending}
                  onClick={save}
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
                  title={item.hasVacancy ? t("alreadyPublished") : t("publishButton")}
                  aria-label={t("publishButton")}
                  disabled={pending || item.hasVacancy}
                  onClick={publish}
                >
                  <Megaphone size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="sru-icon-action"
                  title={t("deleteButton")}
                  aria-label={t("deleteButton")}
                  disabled={pending}
                  onClick={remove}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </>
            )}
          </div>
          {editing && (
            <input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t("fieldJustification")}
              style={{ marginTop: 6, minWidth: 160 }}
            />
          )}
        </td>
      )}
    </tr>
  );
}
