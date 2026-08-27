"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateCycleMethodWeights } from "@/app/[locale]/(app)/evaluations/cycles/actions";
import {
  evaluationMethods,
  isValidWeights,
  weightsTotal,
  type EvaluationMethod,
  type MethodWeights,
} from "@/lib/evaluationCycle";

/**
 * The cycle's split between the four evaluation methods.
 *
 * Read-only for anyone below approve level: the fields still render with the
 * real numbers, because knowing how you are weighted is not privileged — only
 * changing it is. Save stays disabled until the numbers actually differ from
 * what is stored AND total exactly 100, so an invalid distribution can never
 * be sent in the first place; the DB CHECK is still the real guarantee.
 */
export function CycleMethodWeightsForm({
  cycleId,
  initial,
  canEdit,
}: {
  cycleId: string;
  initial: MethodWeights;
  canEdit: boolean;
}) {
  const t = useTranslations("EvaluationCyclePage");
  const [saved, setSaved] = useState<MethodWeights>(initial);
  const [values, setValues] = useState<MethodWeights>(initial);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const total = weightsTotal(values);
  const dirty = evaluationMethods.some((method) => Number(values[method]) !== Number(saved[method]));
  const valid = isValidWeights(values);

  const labels: Record<EvaluationMethod, string> = {
    goals: t("methodGoals"),
    competencies: t("methodCompetencies"),
    bau: t("methodBau"),
    feedback360: t("methodFeedback360"),
  };

  function save() {
    setState("idle");
    startTransition(async () => {
      const result = await updateCycleMethodWeights({
        cycleId,
        goals: Number(values.goals),
        competencies: Number(values.competencies),
        bau: Number(values.bau),
        feedback360: Number(values.feedback360),
      });
      if (result.status === "success") {
        setSaved(values);
        setState("saved");
      } else {
        setState("error");
      }
    });
  }

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("weightsNote")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        {evaluationMethods.map((method) => (
          <div key={method} className="sru-field" style={{ width: 120 }}>
            <label htmlFor={`weight-${method}`}>{labels[method]}</label>
            <input
              id={`weight-${method}`}
              type="number"
              min={0}
              max={100}
              step={1}
              dir="ltr"
              disabled={!canEdit || pending}
              value={values[method]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [method]: Number(event.target.value) }))
              }
              style={{ textAlign: "center" }}
            />
          </div>
        ))}
        <div style={{ fontSize: 12, paddingBottom: 8 }}>
          <span style={{ color: "var(--sru-muted)" }}>{t("weightsTotal")}: </span>
          <strong style={{ color: valid ? "var(--sru-success, #1f9d55)" : "var(--sru-danger, #b91c1c)" }}>
            {total}%
          </strong>
        </div>
        {canEdit ? (
          <button
            type="button"
            className="sru-btn sru-btn-primary sru-btn-slim"
            disabled={!dirty || !valid || pending}
            onClick={save}
            style={{ marginBottom: 4 }}
          >
            {t("weightsSave")}
          </button>
        ) : null}
      </div>
      {!valid ? (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12, marginTop: 8 }}>{t("weightsInvalid")}</p>
      ) : null}
      {state === "saved" ? (
        <p style={{ color: "var(--sru-success, #1f9d55)", fontSize: 12, marginTop: 8 }}>{t("weightsSaved")}</p>
      ) : null}
      {state === "error" ? (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12, marginTop: 8 }}>{t("weightsError")}</p>
      ) : null}
      {!canEdit ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8 }}>{t("weightsReadOnly")}</p>
      ) : null}
    </div>
  );
}
