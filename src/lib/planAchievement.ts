/**
 * How much of a strategic plan has actually been ACHIEVED — deliberately a
 * different question from how much of its period has elapsed.
 *
 * Asked for on 2026-08-22: "اجعل الخط الزمني ... أما المؤشر الدائري فاجعله
 * نسبة الإنجاز". Time now has its own bar on the card; the ring answers this.
 *
 * Two real sources exist, and which one produced a number matters enough to
 * be part of the result rather than hidden:
 *
 *  1. `kpi` — KPIs with a recorded actual against their target. This is the
 *     plan's own measurement system, so it wins whenever any actual exists.
 *  2. `initiatives` — the average progress reported on the plan's
 *     initiatives. Weaker (execution, not outcome), but real.
 *
 * When neither has a single number, the result is `none` and the card shows
 * a dash: an unmeasured plan is not a plan at 0%.
 *
 * `reported` / `total` travel with the percentage so the screen can say what
 * the average is actually based on — a plan where one initiative of six
 * reported 40% is not "40% achieved", and the caption has to be able to say so.
 */
export type PlanAchievementKind = "kpi" | "initiatives" | "none";

export interface PlanAchievement {
  /** 0-100, whole number. 0 when `kind` is "none". */
  percent: number;
  kind: PlanAchievementKind;
  /** How many of the items in `total` carried a real number. */
  reported: number;
  total: number;
}

export interface PlanAchievementKpi {
  /** Relative weight; missing or non-positive weights fall back to equal. */
  weight?: number | string | null;
  targetValue?: number | string | null;
  /** The most recent recorded actual, if any. */
  actualValue?: number | string | null;
}

export interface PlanAchievementInitiative {
  progressPercent?: number | string | null;
  statusCode?: string | null;
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function planAchievement(input: {
  kpis?: PlanAchievementKpi[];
  initiatives?: PlanAchievementInitiative[];
}): PlanAchievement {
  const kpis = input.kpis ?? [];
  const initiatives = input.initiatives ?? [];

  const measured = kpis
    .map((k) => ({ weight: num(k.weight), target: num(k.targetValue), actual: num(k.actualValue) }))
    // A target of zero cannot be divided into; such a KPI is not measurable
    // here rather than being counted as 0% or 100%.
    .filter((k) => k.actual != null && k.target != null && k.target !== 0);

  if (measured.length > 0) {
    // Equal weighting unless every measured KPI carries a positive weight —
    // mixing "weighted" and "unweighted" silently would make the number mean
    // different things on different plans.
    const useWeights = measured.every((k) => k.weight != null && k.weight > 0);
    const totalWeight = useWeights ? measured.reduce((sum, k) => sum + (k.weight as number), 0) : measured.length;
    const score = measured.reduce((sum, k) => {
      const ratio = Math.min(100, Math.max(0, ((k.actual as number) / (k.target as number)) * 100));
      return sum + ratio * (useWeights ? (k.weight as number) : 1);
    }, 0);
    return { percent: clampPercent(score / totalWeight), kind: "kpi", reported: measured.length, total: kpis.length };
  }

  const reportedInitiatives = initiatives
    .map((i) => {
      const p = num(i.progressPercent);
      if (p != null) return Math.min(100, Math.max(0, p));
      // A finished initiative is 100% even with no percentage typed.
      if (i.statusCode === "done") return 100;
      return null;
    })
    .filter((v): v is number => v != null);

  if (reportedInitiatives.length > 0) {
    const sum = reportedInitiatives.reduce((a, b) => a + b, 0);
    return {
      percent: clampPercent(sum / reportedInitiatives.length),
      kind: "initiatives",
      reported: reportedInitiatives.length,
      total: initiatives.length,
    };
  }

  return { percent: 0, kind: "none", reported: 0, total: initiatives.length };
}
