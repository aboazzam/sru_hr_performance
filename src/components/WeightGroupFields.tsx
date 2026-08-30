"use client";

import { useTranslations } from "next-intl";
import {
  evaluationMethodGroupKeys,
  evaluationMethodGroups,
  groupWeight,
  isValidWeights,
  weightsTotal,
  type EvaluationMethod,
  type EvaluationMethodGroup,
  type MethodWeights,
} from "@/lib/evaluationCycle";

export const methodLabelKeys: Record<EvaluationMethod, string> = {
  activities: "weightActivitiesShort",
  bau: "weightBauShort",
  competencies: "weightCompetenciesShort",
  feedback360: "weightFeedback360Short",
};

export const groupLabelKeys: Record<EvaluationMethodGroup, string> = {
  results: "groupResults",
  behaviour: "groupBehaviour",
};

/**
 * The four weights, shown under the two families they belong to: results
 * (what the employee was assigned to do) and behaviour (how they did it).
 *
 * Each family's figure is the sum of its own two, computed here rather than
 * entered — a typed group total and typed leaves are two numbers for one
 * fact, and they drift. The 100% rule stays on the four leaves, which is
 * also where the database CHECK sits.
 */
export function WeightGroupFields({
  idPrefix,
  values,
  onChange,
  disabled = false,
  fieldNames,
}: {
  idPrefix: string;
  values: MethodWeights;
  onChange: (next: MethodWeights) => void;
  disabled?: boolean;
  /** When set, each input also submits under this name (FormData forms). */
  fieldNames?: Record<EvaluationMethod, string>;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const total = weightsTotal(values);
  const valid = isValidWeights(values);

  return (
    <div>
      {evaluationMethodGroupKeys.map((group) => (
        <section key={group} style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <h4 style={{ fontSize: 13, margin: 0 }}>{t(groupLabelKeys[group])}</h4>
            <span style={{ fontSize: 12, color: "var(--sru-muted)" }}>
              {groupWeight(values, group)}%
            </span>
          </div>
          <p style={{ color: "var(--sru-muted)", fontSize: 11.5, margin: "0 0 8px" }}>
            {t(group === "results" ? "groupResultsNote" : "groupBehaviourNote")}
          </p>

          {evaluationMethodGroups[group].map((method) => (
            <div className="sru-field" key={method} style={{ marginBottom: 10 }}>
              <label htmlFor={`${idPrefix}-${method}`}>{t(methodLabelKeys[method])}</label>
              <input
                id={`${idPrefix}-${method}`}
                name={fieldNames?.[method]}
                type="number" lang="en"
                min={0}
                max={100}
                step={1}
                dir="ltr"
                disabled={disabled}
                value={values[method]}
                onChange={(event) => onChange({ ...values, [method]: Number(event.target.value) })}
              />
            </div>
          ))}
        </section>
      ))}

      <p style={{ fontSize: 12.5, color: valid ? "var(--sru-muted)" : "#b91c1c", marginTop: 2 }}>
        {t("weightsTotalLabel")}: <strong>{total}%</strong>
        {valid ? "" : ` — ${t("weightsInvalid")}`}
      </p>
    </div>
  );
}
