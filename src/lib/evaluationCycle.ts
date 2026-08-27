/**
 * Helpers for the evaluation-cycles management screen.
 *
 * A cycle's "status" is derived from its own dates, not stored — the table
 * has no status column, and inventing one would put a second source of truth
 * next to `start_date`/`end_date`.
 */
export const cycleStatuses = ["upcoming", "active", "ended"] as const;
export type CycleStatus = (typeof cycleStatuses)[number];

export const cycleStatusLabels: Record<CycleStatus, string> = {
  upcoming: "لم تبدأ",
  active: "جارية",
  ended: "منتهية",
};

/**
 * Dates are plain `date` columns (YYYY-MM-DD, no time zone), so this
 * compares them as strings against a YYYY-MM-DD "today" rather than
 * constructing Date objects — the same reason the Excel import parses date
 * strings by regex instead of `new Date(str)`: this project already hit a
 * real off-by-one-day bug from UTC conversion.
 *
 * Both ends are inclusive: a cycle is `active` on its own start and end day.
 */
export function cycleStatus(startDate: string, endDate: string, today: string): CycleStatus {
  if (today < startDate) return "upcoming";
  if (today > endDate) return "ended";
  return "active";
}

/** YYYY-MM-DD for the given timezone, matching how `date` columns are stored. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the `date` column shape.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Every table with a `cycle_id` FK. Used both to show how many real records
 * depend on a cycle and to block a soft-delete that would strand them —
 * the FKs are ON DELETE RESTRICT, which only guards a hard DELETE, and this
 * app soft-deletes (CLAUDE.md §5-A rule 7), so the check has to be explicit.
 */
export const cycleDependentTables = [
  "evaluations",
  "goals",
  "bau_tasks",
  "feedback_360",
  "promotions",
  "rewards",
  "recommendations",
  "calibration_sessions",
  "targets",
  "kpi_annual_targets",
] as const;
export type CycleDependentTable = (typeof cycleDependentTables)[number];

/** Sums per-table dependent counts into one number per cycle id. */
export function totalCycleUsage(counts: Partial<Record<CycleDependentTable, number>>): number {
  return Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0);
}

/**
 * Per-cycle scoring progress, for the indicators under the cycles table
 * (2026-08-27).
 *
 * "Scored" means an evaluation has at least one recorded score — the SAME
 * meaning the per-employee icon inside a cycle uses. That is deliberate: a
 * reader can count the icons on one screen and reach the number shown on the
 * other. Approval stage answers a different question (where the paperwork got
 * to) and is not mixed in here.
 *
 * The average is over SCORES, not over evaluations: an evaluation with twenty
 * scores and one with two do not weigh the same, because the average answers
 * "what did this cycle score", not "what did the average form score". And it
 * is null — not zero — when nothing has been scored, so an untouched cycle
 * never reads as a cycle that scored zero.
 */
export interface CycleScoringSummary {
  total: number;
  scored: number;
  remaining: number;
  averageScore: number | null;
}

export function summariseCycleScoring(
  evaluations: ReadonlyArray<{ id: string; cycle_id: string }>,
  scores: ReadonlyArray<{ evaluation_id: string; score: number | null }>
): Map<string, CycleScoringSummary> {
  const cycleOf = new Map(evaluations.map((e) => [e.id, e.cycle_id]));

  const scoredEvaluations = new Map<string, Set<string>>();
  const sums = new Map<string, { total: number; count: number }>();

  for (const row of scores) {
    const cycleId = cycleOf.get(row.evaluation_id);
    // A score whose evaluation is not in view (RLS, another cycle) must not
    // land in any cycle's numbers.
    if (cycleId == null) continue;

    const seen = scoredEvaluations.get(cycleId) ?? new Set<string>();
    seen.add(row.evaluation_id);
    scoredEvaluations.set(cycleId, seen);

    if (row.score == null) continue;
    const agg = sums.get(cycleId) ?? { total: 0, count: 0 };
    agg.total += row.score;
    agg.count += 1;
    sums.set(cycleId, agg);
  }

  const totals = new Map<string, number>();
  for (const e of evaluations) totals.set(e.cycle_id, (totals.get(e.cycle_id) ?? 0) + 1);

  const summary = new Map<string, CycleScoringSummary>();
  for (const [cycleId, total] of totals) {
    const scored = scoredEvaluations.get(cycleId)?.size ?? 0;
    const agg = sums.get(cycleId);
    summary.set(cycleId, {
      total,
      scored,
      remaining: total - scored,
      averageScore: agg && agg.count > 0 ? Math.round((agg.total / agg.count) * 10) / 10 : null,
    });
  }
  return summary;
}

/**
 * The four evaluation methods, and how a cycle splits its score between them.
 *
 * The distribution lives on the CYCLE (20260827000001), so every evaluation
 * inside it is weighted identically — that is the whole point of the request
 * ("يتم تطبيقه على جميع التقييمات في هذه الدورة"). Two employees in one cycle
 * measured on different weightings could not be compared, let alone calibrated.
 */
export const evaluationMethods = ["goals", "competencies", "bau", "feedback360"] as const;
export type EvaluationMethod = (typeof evaluationMethods)[number];
export type MethodWeights = Record<EvaluationMethod, number>;

/** Tolerance matches the DB CHECK — NUMERIC(5,2) makes exact equality brittle. */
export const WEIGHT_TOTAL_TOLERANCE = 0.01;

export function weightsTotal(weights: MethodWeights): number {
  return evaluationMethods.reduce((sum, method) => sum + (Number(weights[method]) || 0), 0);
}

export function isValidWeights(weights: MethodWeights): boolean {
  const inRange = evaluationMethods.every((method) => {
    const value = Number(weights[method]);
    return Number.isFinite(value) && value >= 0 && value <= 100;
  });
  return inRange && Math.abs(weightsTotal(weights) - 100) < WEIGHT_TOTAL_TOLERANCE;
}

export type WeightedScore = {
  /** null when nothing scorable exists yet — never 0, which would read as a real zero. */
  score: number | null;
  /** Share of the cycle's 100% that actually contributed. */
  appliedWeight: number;
  /** Methods carrying weight but holding no score yet. */
  missing: EvaluationMethod[];
};

/**
 * Applies a cycle's distribution to whatever a single evaluation actually has.
 *
 * A method with weight but no score is NOT counted as zero — that would punish
 * an employee for paperwork nobody has filled in. Its weight is excluded and
 * the rest renormalised, with the excluded methods reported so the screen can
 * say the total is partial instead of presenting it as final.
 */
export function weightedCycleScore(
  weights: MethodWeights,
  scores: Partial<Record<EvaluationMethod, number | null>>
): WeightedScore {
  let weighted = 0;
  let appliedWeight = 0;
  const missing: EvaluationMethod[] = [];

  for (const method of evaluationMethods) {
    const weight = Number(weights[method]) || 0;
    if (weight <= 0) continue;
    const value = scores[method];
    if (value == null || !Number.isFinite(value)) {
      missing.push(method);
      continue;
    }
    weighted += value * weight;
    appliedWeight += weight;
  }

  if (appliedWeight <= 0) return { score: null, appliedWeight: 0, missing };
  return { score: weighted / appliedWeight, appliedWeight, missing };
}
