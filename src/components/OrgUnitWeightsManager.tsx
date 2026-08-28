"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { RotateCcw } from "lucide-react";
import {
  updateOrgUnitWeights,
  clearOrgUnitWeights,
} from "@/app/[locale]/(app)/evaluations/cycles/actions";
import { WeightGroupFields } from "@/components/WeightGroupFields";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  evaluationMethodGroupKeys,
  evaluationMethods,
  groupWeight,
  isValidWeights,
  type MethodWeights,
} from "@/lib/evaluationCycle";

const errorKeys: Record<string, string> = {
  invalid_input: "weightsErrorInvalid",
  unauthenticated: "manageErrorUnauthenticated",
  forbidden: "weightsErrorForbidden",
  has_dependents: "weightsErrorUnknown",
  unknown: "weightsErrorUnknown",
};

export interface OrgUnitWeightsRow {
  orgUnitId: string;
  nameAr: string;
  employeeCount: number;
  /** null when the department has no distribution of its own. */
  own: MethodWeights | null;
}

/** One department: its own distribution, or the cycle's until it sets one. */
function UnitRow({
  cycleId,
  row,
  cycleWeights,
  canEdit,
}: {
  cycleId: string;
  row: OrgUnitWeightsRow;
  cycleWeights: MethodWeights;
  canEdit: boolean;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<MethodWeights>(row.own ?? cycleWeights);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effective = row.own ?? cycleWeights;
  const dirty = evaluationMethods.some((m) => Number(values[m]) !== Number(effective[m]));
  const valid = isValidWeights(values);

  function run(fn: () => Promise<{ status: string; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.status === "success") {
        setExpanded(false);
        router.refresh();
      } else {
        setError(result.message ?? "unknown");
      }
    });
  }

  return (
    <div style={{ borderBottom: "1px solid var(--sru-border)", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 180 }}>
          {row.nameAr}
          <span style={{ color: "var(--sru-muted)", fontSize: 11.5, marginInlineStart: 8 }}>
            {t("unitEmployeeCount", { count: row.employeeCount })}
          </span>
        </span>

        <span style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
          {evaluationMethodGroupKeys
            .map((group) => `${t(group === "results" ? "groupResults" : "groupBehaviour")} ${groupWeight(effective, group)}%`)
            .join(" · ")}
        </span>

        <span className="pill" style={{ fontSize: 11 }}>
          {row.own ? t("unitOwnWeights") : t("unitInheritedWeights")}
        </span>

        {canEdit ? (
          <>
            <button
              type="button"
              className="sru-btn sru-btn-slim"
              onClick={() => {
                setValues(effective);
                setError(null);
                setExpanded((current) => !current);
              }}
            >
              {expanded ? t("closeButton") : t("unitEditButton")}
            </button>
            {row.own ? (
              <button
                type="button"
                className="sru-icon-action"
                title={t("unitResetButton")}
                aria-label={t("unitResetButton")}
                disabled={pending}
                onClick={() => run(() => clearOrgUnitWeights(cycleId, row.orgUnitId))}
              >
                <RotateCcw size={14} aria-hidden />
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {expanded ? (
        <div style={{ marginTop: 12, maxWidth: 380 }}>
          <WeightGroupFields
            idPrefix={`unit-${row.orgUnitId}`}
            values={values}
            onChange={setValues}
            disabled={pending}
          />
          {error ? (
            <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
              {t(errorKeys[error] ?? "weightsErrorUnknown")}
            </p>
          ) : null}
          <button
            type="button"
            className="sru-btn sru-btn-primary sru-btn-slim"
            style={{ marginTop: 8 }}
            disabled={!dirty || !valid || pending}
            onClick={() =>
              run(() =>
                updateOrgUnitWeights({
                  cycleId,
                  orgUnitId: row.orgUnitId,
                  activities: Number(values.activities),
                  bau: Number(values.bau),
                  competencies: Number(values.competencies),
                  feedback360: Number(values.feedback360),
                })
              )
            }
          >
            {pending ? t("weightsSaving") : t("weightsSave")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Per-department weights inside one cycle.
 *
 * A department with no row of its own is not shown as empty — it shows the
 * cycle's distribution with an explicit "inherited" badge, because that IS
 * what governs it. Setting weights here creates the department's own row;
 * the reset icon removes it and returns the department to the cycle's.
 */
export function OrgUnitWeightsManager({
  cycleId,
  cycleWeights,
  rows,
  canEdit,
}: {
  cycleId: string;
  cycleWeights: MethodWeights;
  rows: OrgUnitWeightsRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("EvaluationCyclesPage");
  const [search, setSearch] = useState("");

  const filtered = rows.filter(
    (row) => search.trim() === "" || includesIgnoringHamza(row.nameAr, search)
  );

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("unitsNote")}</p>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("unitsSearchPlaceholder")}
        style={{ maxWidth: 320, marginBottom: 10 }}
      />

      {rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("unitsEmpty")}</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("unitsNoMatches")}</p>
      ) : (
        filtered.map((row) => (
          <UnitRow
            key={row.orgUnitId}
            cycleId={cycleId}
            row={row}
            cycleWeights={cycleWeights}
            canEdit={canEdit}
          />
        ))
      )}
    </div>
  );
}
