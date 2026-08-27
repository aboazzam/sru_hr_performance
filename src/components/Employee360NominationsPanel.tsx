"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2, UserPlus, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AddFormDialog } from "@/components/AddFormDialog";
import {
  nominateFeedback360Evaluator,
  removeFeedback360Nomination,
} from "@/app/[locale]/(app)/employees/[id]/tab-actions";
import { evalTypes, evalTypeLabels, type EvalType } from "@/lib/vpra";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

const errorMessageKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

export interface NominationRow {
  id: string;
  cycleId: string;
  cycleName: string;
  evaluatorId: string;
  evaluatorName: string;
  relation: EvalType;
  /** Whether that evaluator has actually filed their feedback yet. */
  submitted: boolean;
}

export interface NominationOption {
  id: string;
  name: string;
}

/**
 * Who will evaluate this employee in 360 feedback.
 *
 * A nomination is not the feedback: feedback_360's own INSERT policy requires
 * the evaluator to be the caller, so only the evaluator can ever file it. The
 * nomination records the decision beforehand, and the submitted flag says
 * whether that person has since acted on it.
 */
export function Employee360NominationsPanel({
  targetEmployeeId,
  cycles,
  employees,
  nominations,
  canEdit,
}: {
  targetEmployeeId: string;
  cycles: NominationOption[];
  employees: NominationOption[];
  nominations: NominationRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("Employee360Tab");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const [relation, setRelation] = useState<EvalType>("peer");
  const [search, setSearch] = useState("");
  const [evaluatorId, setEvaluatorId] = useState("");

  // "self" nominates the employee to rate themselves; every other relation is
  // someone else, so the employee is dropped from the list rather than being
  // offered and then refused by the DB CHECK.
  const selectable = employees.filter((person) =>
    relation === "self" ? person.id === targetEmployeeId : person.id !== targetEmployeeId
  );
  const filtered = selectable.filter(
    (person) => search.trim() === "" || includesIgnoringHamza(person.name, search)
  );
  const effectiveEvaluatorId =
    relation === "self"
      ? targetEmployeeId
      : filtered.some((person) => person.id === evaluatorId)
        ? evaluatorId
        : "";

  function run(fn: () => Promise<{ status: string; message?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") {
        onDone?.();
        router.refresh();
      } else {
        setError(result.message ?? "unknown");
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: 0, maxWidth: 620 }}>{t("note")}</p>
        {canEdit && cycles.length > 0 ? (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addNomination")}
            heading={t("addNomination")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="nomination-cycle">{t("cycleLabel")}</label>
              <select id="nomination-cycle" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sru-field" style={{ marginBottom: 12 }}>
              <label htmlFor="nomination-relation">{t("relationLabel")}</label>
              <select
                id="nomination-relation"
                value={relation}
                onChange={(e) => setRelation(e.target.value as EvalType)}
              >
                {evalTypes.map((type) => (
                  <option key={type} value={type}>
                    {evalTypeLabels[type]}
                  </option>
                ))}
              </select>
            </div>
            {relation === "self" ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("selfNote")}</p>
            ) : (
              <div className="sru-field" style={{ marginBottom: 12 }}>
                <label htmlFor="nomination-evaluator">{t("evaluatorLabel")}</label>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("evaluatorSearchPlaceholder")}
                  style={{ marginBottom: 6 }}
                />
                <select
                  id="nomination-evaluator"
                  value={effectiveEvaluatorId}
                  disabled={filtered.length === 0}
                  onChange={(e) => setEvaluatorId(e.target.value)}
                >
                  {filtered.length === 0 ? (
                    <option value="">{t("evaluatorNoMatches")}</option>
                  ) : (
                    <>
                      <option value="">{t("evaluatorPlaceholder")}</option>
                      {filtered.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            )}
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>
                {t(errorMessageKeys[error] ?? "errorUnknown")}
              </p>
            ) : null}
            <button
              type="button"
              className="sru-btn sru-btn-primary sru-btn-slim"
              disabled={pending || !cycleId || !effectiveEvaluatorId}
              onClick={() =>
                run(
                  () =>
                    nominateFeedback360Evaluator({
                      cycleId,
                      targetEmployeeId,
                      evaluatorId: effectiveEvaluatorId,
                      relation,
                    }),
                  () => {
                    setEvaluatorId("");
                    setSearch("");
                    dialogRef.current?.close();
                  }
                )
              }
            >
              <UserPlus size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
              {t("addNomination")}
            </button>
          </AddFormDialog>
        ) : null}
      </div>

      {cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 14 }}>{t("noCycles")}</p>
      ) : nominations.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginTop: 14 }}>{t("empty")}</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: 14 }}>
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>{t("columnEvaluator")}</th>
                <th>{t("columnRelation")}</th>
                <th>{t("columnCycle")}</th>
                <th>{t("columnStatus")}</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {nominations.map((row) => (
                <tr key={row.id}>
                  <td>{row.evaluatorName}</td>
                  <td>{evalTypeLabels[row.relation]}</td>
                  <td>{row.cycleName}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: row.submitted ? "var(--sru-success, #1f9d55)" : "var(--sru-muted)",
                      }}
                    >
                      {row.submitted ? <CheckCircle2 size={15} aria-hidden /> : <Clock size={15} aria-hidden />}
                      {row.submitted ? t("statusSubmitted") : t("statusPending")}
                    </span>
                  </td>
                  {canEdit ? (
                    <td>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeFeedback360Nomination(row.id))}
                        className="sru-icon-action danger"
                        title={t("removeNomination")}
                        aria-label={t("removeNomination")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error ? (
        <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>
          {t(errorMessageKeys[error] ?? "errorUnknown")}
        </p>
      ) : null}
    </div>
  );
}
