/**
 * Analytics behind the recruitment plan's dashboard and its finance review:
 * budget variance and the three distributions the spec asks for (by org
 * unit, by contract type, by quarter).
 *
 * Pure and unit-tested, for the same reason `recruitmentPlan.ts` is: money
 * arithmetic that decides whether a plan reads as under or over budget must
 * not be verifiable only by looking at a screen.
 *
 * Consistency note: every figure here treats an item's
 * `estimatedMonthlyCost` as the cost of ONE position, multiplied by
 * `headcount` — exactly as `computeRecruitmentPlanTotals` already does. The
 * two must never disagree, or the dashboard would contradict the header.
 */

import type { RecruitmentPlanItemCost } from "./recruitmentPlan";

export interface BudgetVariance {
  /** The plan's own annual figure, summed from its items. */
  totalAnnualCost: number;
  /** What finance approved. Null until finance records it. */
  approvedBudget: number | null;
  /**
   * approvedBudget - totalAnnualCost. Positive = room left, negative =
   * overrun. Null when there is no approved budget to compare against —
   * deliberately NOT 0, which would read as "exactly on budget".
   */
  variance: number | null;
  /** Percentage of the approved budget the plan consumes. Null if no budget. */
  consumedPercentage: number | null;
  /** Drives the green/red treatment the spec asks for. */
  status: "no_budget" | "under" | "exact" | "over";
}

export function computeBudgetVariance(
  totalAnnualCost: number,
  approvedBudget: number | null
): BudgetVariance {
  if (approvedBudget === null) {
    return {
      totalAnnualCost,
      approvedBudget: null,
      variance: null,
      consumedPercentage: null,
      status: "no_budget",
    };
  }

  const variance = approvedBudget - totalAnnualCost;
  // A zero approved budget is a real, meaningful state (nothing granted), so
  // it must not divide — any spend against it is an overrun, not Infinity%.
  const consumedPercentage =
    approvedBudget === 0 ? (totalAnnualCost === 0 ? 0 : null) : (totalAnnualCost / approvedBudget) * 100;

  return {
    totalAnnualCost,
    approvedBudget,
    variance,
    consumedPercentage,
    status: variance > 0 ? "under" : variance === 0 ? "exact" : "over",
  };
}

export interface DistributionRow {
  key: string;
  label: string;
  headcount: number;
  monthlyCost: number;
  annualCost: number;
  /** Share of the plan's total headcount, 0-100. */
  headcountPercentage: number;
}

export interface DistributionItem extends RecruitmentPlanItemCost {
  /** Grouping key; a null/blank one falls into the "unspecified" bucket. */
  groupKey: string | null;
  groupLabel: string | null;
}

/** Shown for items whose grouping value is genuinely absent. */
export const UNSPECIFIED_GROUP_KEY = "__unspecified__";
export const UNSPECIFIED_GROUP_LABEL = "غير محدد";

/**
 * Groups items and sorts by headcount descending, so the biggest demand
 * leads. Items with no group value are bucketed under "غير محدد" rather
 * than dropped — silently omitting them would make the distribution's
 * totals disagree with the plan's own headcount.
 */
export function computeDistribution(items: DistributionItem[]): DistributionRow[] {
  const totalHeadcount = items.reduce((sum, item) => sum + item.headcount, 0);
  const buckets = new Map<string, DistributionRow>();

  for (const item of items) {
    const key = item.groupKey && item.groupKey.trim() !== "" ? item.groupKey : UNSPECIFIED_GROUP_KEY;
    const label =
      key === UNSPECIFIED_GROUP_KEY ? UNSPECIFIED_GROUP_LABEL : (item.groupLabel ?? item.groupKey ?? key);

    const bucket = buckets.get(key) ?? {
      key,
      label,
      headcount: 0,
      monthlyCost: 0,
      annualCost: 0,
      headcountPercentage: 0,
    };
    bucket.headcount += item.headcount;
    if (item.estimatedMonthlyCost !== null) {
      bucket.monthlyCost += item.estimatedMonthlyCost * item.headcount;
    }
    buckets.set(key, bucket);
  }

  const rows = [...buckets.values()].map((bucket) => ({
    ...bucket,
    annualCost: bucket.monthlyCost * 12,
    headcountPercentage: totalHeadcount === 0 ? 0 : (bucket.headcount / totalHeadcount) * 100,
  }));

  // Headcount descending, then label, so the order is stable across renders
  // rather than depending on insertion order for ties.
  return rows.sort((a, b) => b.headcount - a.headcount || a.label.localeCompare(b.label, "ar"));
}

/** Arabic labels for the contract types, keyed by the DB enum values. */
export const contractTypeLabels: Record<string, string> = {
  permanent: "دائم",
  temporary: "مؤقت",
  part_time: "دوام جزئي",
};

export function contractTypeLabel(value: string | null): string {
  if (!value) return UNSPECIFIED_GROUP_LABEL;
  return contractTypeLabels[value] ?? value;
}

export function quarterLabel(quarter: number | null): string {
  if (quarter === null) return UNSPECIFIED_GROUP_LABEL;
  return `الربع ${["", "الأول", "الثاني", "الثالث", "الرابع"][quarter] ?? quarter}`;
}
