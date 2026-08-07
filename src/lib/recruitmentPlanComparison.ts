/**
 * Year-over-year comparison of two plans, per org unit.
 *
 * Pure and unit-tested, for the reason the rest of this module's arithmetic
 * is: a table that tells HR "this department grew by 4" must be verifiable
 * without staging two years of real plans.
 */

import type { DistributionRow } from "./recruitmentPlanAnalytics";

export interface ComparisonRow {
  key: string;
  label: string;
  previousHeadcount: number;
  currentHeadcount: number;
  headcountDelta: number;
  previousAnnualCost: number;
  currentAnnualCost: number;
  annualCostDelta: number;
}

/**
 * Full outer join of the two distributions by group key.
 *
 * A unit present in only ONE year still gets a row, with zeroes on the other
 * side — a department that appears for the first time, or one that dropped
 * out entirely, is exactly what a year-over-year comparison exists to
 * surface. Dropping either would understate the change.
 *
 * Sorted by the size of the headcount change (largest movement first, in
 * either direction), so the rows that need explaining lead.
 */
export function comparePlans(
  current: DistributionRow[],
  previous: DistributionRow[]
): ComparisonRow[] {
  const byKey = new Map<string, ComparisonRow>();

  const ensure = (key: string, label: string): ComparisonRow => {
    const existing = byKey.get(key);
    if (existing) return existing;
    const created: ComparisonRow = {
      key,
      label,
      previousHeadcount: 0,
      currentHeadcount: 0,
      headcountDelta: 0,
      previousAnnualCost: 0,
      currentAnnualCost: 0,
      annualCostDelta: 0,
    };
    byKey.set(key, created);
    return created;
  };

  for (const row of previous) {
    const target = ensure(row.key, row.label);
    target.previousHeadcount = row.headcount;
    target.previousAnnualCost = row.annualCost;
  }
  for (const row of current) {
    const target = ensure(row.key, row.label);
    target.currentHeadcount = row.headcount;
    target.currentAnnualCost = row.annualCost;
  }

  const rows = [...byKey.values()].map((row) => ({
    ...row,
    headcountDelta: row.currentHeadcount - row.previousHeadcount,
    annualCostDelta: row.currentAnnualCost - row.previousAnnualCost,
  }));

  return rows.sort(
    (a, b) =>
      Math.abs(b.headcountDelta) - Math.abs(a.headcountDelta) ||
      a.label.localeCompare(b.label, "ar")
  );
}
