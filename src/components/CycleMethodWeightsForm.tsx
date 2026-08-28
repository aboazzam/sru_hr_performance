"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateCycleMethodWeights } from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { evaluationMethods, isValidWeights, type MethodWeights } from "@/lib/evaluationCycle";
import { WeightGroupFields } from "@/components/WeightGroupFields";

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

  const dirty = evaluationMethods.some((method) => Number(values[method]) !== Number(saved[method]));
  const valid = isValidWeights(values);


  function save() {
    setState("idle");
    startTransition(async () => {
      const result = await updateCycleMethodWeights({
        cycleId,
        activities: Number(values.activities),
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
      <WeightGroupFields
        idPrefix={`cycle-${cycleId}`}
        values={values}
        onChange={setValues}
        disabled={!canEdit || pending}
      />
      {canEdit ? (
        <button
          type="button"
          className="sru-btn sru-btn-primary sru-btn-slim"
          disabled={!dirty || !valid || pending}
          onClick={save}
          style={{ marginTop: 8 }}
        >
          {t("weightsSave")}
        </button>
      ) : null}
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
