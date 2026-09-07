/**
 * Shared computation for the "نتائج التقييم" (Evaluation Results) module.
 *
 * `computeEmployeeCycleResult`/`averageScores` are a pure extraction of the
 * exact logic `/evaluations/[id]/page.tsx` already runs inline for ONE
 * evaluation — kept as one implementation so a future change to how the
 * weighted score is computed can't drift between the single-evaluation
 * detail page and this module's batch aggregation across many employees.
 *
 * `resolveEvaluationResultsForCycle` is the batch orchestrator: one query per
 * table for the whole cycle (never one query per employee), so it stays
 * cheap regardless of how many employees a cycle covers.
 *
 * The "official" result is always the employee's `eval_type='supervisor'`
 * evaluation for the cycle — confirmed with the project owner: self/peer/
 * customer evaluations (if they exist as separate rows) stay purely
 * informative and are never read or blended in here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getThreeSixtyReport } from "@/app/[locale]/(app)/three-sixty/report/reportData";
import { resolveWeights, weightedCycleScore, type EvaluationMethod, type MethodWeights } from "./evaluationCycle";
import { bandForScore, type RatingBand } from "./ratingBands";

/** Same shape as the `average()` closure `/evaluations/[id]/page.tsx` used inline. */
export function averageScores(values: ReadonlyArray<number | null | undefined>): number | null {
  const real = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return real.length === 0 ? null : real.reduce((sum, value) => sum + value, 0) / real.length;
}

export interface EmployeeCycleResultInputs {
  activityScores: ReadonlyArray<number | null | undefined>;
  competencyScores: ReadonlyArray<number | null | undefined>;
  bauTaskScores: ReadonlyArray<number | null | undefined>;
  /** Already 0-100, from `getThreeSixtyReport(...).overallScorePercent`. */
  feedback360Percent: number | null;
}

export interface EmployeeCycleResult {
  employeeId: string;
  evaluationId: string;
  orgUnitId: string | null;
  weights: MethodWeights;
  weightsSource: "cycle" | "orgUnit";
  /** null when nothing scorable exists yet — never 0. */
  score: number | null;
  appliedWeight: number;
  missing: EvaluationMethod[];
  band: RatingBand | null;
  /** Per-method average, before weighting — the employee-results table's mini breakdown. */
  methodScores: Partial<Record<EvaluationMethod, number | null>>;
}

/** Pure: no Supabase call, fully unit-testable. */
export function computeEmployeeCycleResult(params: {
  employeeId: string;
  evaluationId: string;
  orgUnitId: string | null;
  cycleWeights: MethodWeights;
  orgUnitWeights: MethodWeights | null;
  inputs: EmployeeCycleResultInputs;
}): EmployeeCycleResult {
  const { employeeId, evaluationId, orgUnitId, cycleWeights, orgUnitWeights, inputs } = params;
  const { weights, source } = resolveWeights(cycleWeights, orgUnitWeights);
  const methodScores: Partial<Record<EvaluationMethod, number | null>> = {
    activities: averageScores(inputs.activityScores),
    competencies: averageScores(inputs.competencyScores),
    bau: averageScores(inputs.bauTaskScores),
    feedback360: inputs.feedback360Percent,
  };
  const weighted = weightedCycleScore(weights, methodScores);
  return {
    employeeId,
    evaluationId,
    orgUnitId,
    weights,
    weightsSource: source,
    score: weighted.score,
    appliedWeight: weighted.appliedWeight,
    missing: weighted.missing,
    band: bandForScore(weighted.score),
    methodScores,
  };
}

export interface EmployeeCycleResultRow extends EmployeeCycleResult {
  employeeNumber: string | null;
  employeeName: string | null;
  orgUnitName: string | null;
}

/**
 * Batch results for a whole cycle (or, with `employeeIds`, an explicit
 * subset of it — the "my team" scoping path, mirroring the explicit-filter
 * discipline `/evaluations/team/page.tsx` already uses instead of relying on
 * RLS's broader oversight branch alone).
 *
 * Relies entirely on the caller's own RLS-respecting client for what rows
 * come back — `evaluations`/`evaluation_scores`/`org_unit_evaluation_weights`/
 * `three_sixty_*` each keep their own existing policies untouched.
 */
export async function resolveEvaluationResultsForCycle(
  supabase: SupabaseClient,
  cycleId: string,
  cycleWeights: MethodWeights,
  options: { employeeIds?: string[] } = {}
): Promise<EmployeeCycleResultRow[]> {
  let evaluationsQuery = supabase
    .from("evaluations")
    .select("id, employee_id, profiles(full_name_ar, employee_number, org_unit_id)")
    .eq("cycle_id", cycleId)
    .eq("eval_type", "supervisor")
    .is("deleted_at", null);
  if (options.employeeIds && options.employeeIds.length > 0) {
    evaluationsQuery = evaluationsQuery.in("employee_id", options.employeeIds);
  }
  const { data: evaluationRows } = await evaluationsQuery;
  // supabase-js infers a single-object many-to-one embed as an array (no
  // generated Database types exist in this project) — the established fix
  // elsewhere in this codebase is to cast through `unknown` first rather than
  // trust that inference.
  const evaluations = (evaluationRows ?? []) as unknown as Array<{
    id: string;
    employee_id: string;
    profiles: { full_name_ar: string | null; employee_number: string | null; org_unit_id: string | null } | null;
  }>;
  if (evaluations.length === 0) return [];

  const evaluationIds = evaluations.map((e) => e.id);

  const { data: scoreRows } = await supabase
    .from("evaluation_scores")
    .select("evaluation_id, competency_id, bau_task_id, activity_id, score")
    .in("evaluation_id", evaluationIds)
    .is("deleted_at", null);
  const scoresByEvaluation = new Map<string, { activities: number[]; competencies: number[]; bau: number[] }>();
  for (const row of (scoreRows ?? []) as Array<{
    evaluation_id: string;
    competency_id: string | null;
    bau_task_id: string | null;
    activity_id: string | null;
    score: number | null;
  }>) {
    if (row.score == null) continue;
    const bucket = scoresByEvaluation.get(row.evaluation_id) ?? { activities: [], competencies: [], bau: [] };
    if (row.activity_id) bucket.activities.push(row.score);
    else if (row.competency_id) bucket.competencies.push(row.score);
    else if (row.bau_task_id) bucket.bau.push(row.score);
    scoresByEvaluation.set(row.evaluation_id, bucket);
  }

  const orgUnitIds = [...new Set(evaluations.map((e) => e.profiles?.org_unit_id).filter((id): id is string => !!id))];

  const { data: unitWeightRows } =
    orgUnitIds.length > 0
      ? await supabase
          .from("org_unit_evaluation_weights")
          .select("org_unit_id, weight_activities, weight_competencies, weight_bau, weight_feedback_360")
          .eq("cycle_id", cycleId)
          .in("org_unit_id", orgUnitIds)
          .is("deleted_at", null)
      : { data: [] as never[] };
  const unitWeightsByOrgUnit = new Map<string, MethodWeights>();
  for (const row of (unitWeightRows ?? []) as Array<{
    org_unit_id: string;
    weight_activities: number;
    weight_competencies: number;
    weight_bau: number;
    weight_feedback_360: number;
  }>) {
    unitWeightsByOrgUnit.set(row.org_unit_id, {
      activities: Number(row.weight_activities),
      competencies: Number(row.weight_competencies),
      bau: Number(row.weight_bau),
      feedback360: Number(row.weight_feedback_360),
    });
  }

  // Two separate queries (evaluations->profiles, then a flat org_units
  // lookup) rather than a two-level nested embed
  // (evaluations->profiles->org_units) — this project's own established
  // discipline is to verify an embed shape against the real REST API before
  // relying on it, and no two-level nested embed like that has a precedent
  // anywhere else in this codebase to lean on.
  const { data: orgUnitRows } =
    orgUnitIds.length > 0 ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds) : { data: [] as never[] };
  const orgUnitNameById = new Map(((orgUnitRows ?? []) as Array<{ id: string; name_ar: string }>).map((u) => [u.id, u.name_ar]));

  // The 360 cycle link is resolved ONCE for the whole batch, not once per
  // employee — `resolveThreeSixtyReportForEvaluationCycle`
  // (threeSixtyEvaluationLink.ts) does this same lookup internally on every
  // call, which would repeat it N times in a loop.
  const { data: linkedThreeSixtyCycle } = await supabase
    .from("three_sixty_cycles")
    .select("id")
    .eq("evaluation_cycle_id", cycleId)
    .is("deleted_at", null)
    .maybeSingle();

  const feedback360ByEmployee = new Map<string, number | null>();
  if (linkedThreeSixtyCycle) {
    await Promise.all(
      evaluations.map(async (evaluation) => {
        const report = await getThreeSixtyReport(supabase, evaluation.employee_id, linkedThreeSixtyCycle.id);
        feedback360ByEmployee.set(evaluation.employee_id, report?.overallScorePercent ?? null);
      })
    );
  }

  return evaluations.map((evaluation) => {
    const orgUnitId = evaluation.profiles?.org_unit_id ?? null;
    const scoreBucket = scoresByEvaluation.get(evaluation.id) ?? { activities: [], competencies: [], bau: [] };
    const result = computeEmployeeCycleResult({
      employeeId: evaluation.employee_id,
      evaluationId: evaluation.id,
      orgUnitId,
      cycleWeights,
      orgUnitWeights: orgUnitId ? unitWeightsByOrgUnit.get(orgUnitId) ?? null : null,
      inputs: {
        activityScores: scoreBucket.activities,
        competencyScores: scoreBucket.competencies,
        bauTaskScores: scoreBucket.bau,
        feedback360Percent: feedback360ByEmployee.get(evaluation.employee_id) ?? null,
      },
    });
    return {
      ...result,
      employeeNumber: evaluation.profiles?.employee_number ?? null,
      employeeName: evaluation.profiles?.full_name_ar ?? null,
      orgUnitName: orgUnitId ? orgUnitNameById.get(orgUnitId) ?? null : null,
    };
  });
}
