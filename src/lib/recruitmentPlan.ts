/**
 * Pure helpers for "خطة التوظيف" (the recruitment plan), kept out of the
 * page/actions so the arithmetic behind the plan totals is unit-tested
 * rather than only ever exercised through a live screen.
 */

export interface RecruitmentPlanItemCost {
  headcount: number;
  /**
   * Monthly cost of ONE position (not of the whole `headcount`) — seeded
   * from `salary_scale.step_a` for the item's job title, then editable.
   * Null when the job title has no salary row and nobody typed a figure.
   */
  estimatedMonthlyCost: number | null;
}

export interface RecruitmentPlanTotals {
  /** Sum of every item's headcount. */
  totalHeadcount: number;
  /** Sum of (monthly cost x headcount) across items that have a cost. */
  totalMonthlyCost: number;
  /** totalMonthlyCost x 12 — the figure a yearly plan is budgeted against. */
  totalAnnualCost: number;
  /** Items with no cost figure at all, so a partial total is never read as complete. */
  itemsWithoutCost: number;
}

/** Quarters are 1-4; the DB CHECK enforces the same range. */
export const recruitmentQuarters = [1, 2, 3, 4] as const;
export type RecruitmentQuarter = (typeof recruitmentQuarters)[number];

/** Fixed Arabic domain vocabulary, same convention as `evaluationStateLabels`. */
export const recruitmentQuarterLabels: Record<RecruitmentQuarter, string> = {
  1: "الربع الأول",
  2: "الربع الثاني",
  3: "الربع الثالث",
  4: "الربع الرابع",
};

export const recruitmentPriorities = ["high", "medium", "low"] as const;
export type RecruitmentPriority = (typeof recruitmentPriorities)[number];

export const recruitmentPriorityLabels: Record<RecruitmentPriority, string> = {
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

/**
 * Item lifecycle. `planned` is the DB default; `posted` is set when the item
 * is published as a real `vacancies` row; `filled`/`cancelled` are set by
 * hand. Deliberately not a Postgres enum (no confirmed vocabulary — same
 * precedent as `promotions.status`), so an unknown value coming back from
 * the database renders as-is rather than crashing.
 */
export const recruitmentItemStatuses = ["planned", "posted", "filled", "cancelled"] as const;
export type RecruitmentItemStatus = (typeof recruitmentItemStatuses)[number];

export const recruitmentItemStatusLabels: Record<RecruitmentItemStatus, string> = {
  planned: "مخطط",
  posted: "نُشر شاغر",
  filled: "تم التوظيف",
  cancelled: "ملغي",
};

export function recruitmentItemStatusLabel(status: string): string {
  return recruitmentItemStatusLabels[status as RecruitmentItemStatus] ?? status;
}

export const recruitmentPlanStatuses = ["draft", "approved"] as const;
export type RecruitmentPlanStatus = (typeof recruitmentPlanStatuses)[number];

export const recruitmentPlanStatusLabels: Record<RecruitmentPlanStatus, string> = {
  draft: "مسودة",
  approved: "معتمدة",
};

export function recruitmentPlanStatusLabel(status: string): string {
  return recruitmentPlanStatusLabels[status as RecruitmentPlanStatus] ?? status;
}

/**
 * Plan totals. Items with no cost figure are counted in `totalHeadcount`
 * but reported separately in `itemsWithoutCost`, so a money total is never
 * silently understated without the screen being able to say so.
 */
export function computeRecruitmentPlanTotals(items: RecruitmentPlanItemCost[]): RecruitmentPlanTotals {
  let totalHeadcount = 0;
  let totalMonthlyCost = 0;
  let itemsWithoutCost = 0;

  for (const item of items) {
    totalHeadcount += item.headcount;
    if (item.estimatedMonthlyCost == null) {
      itemsWithoutCost += 1;
      continue;
    }
    totalMonthlyCost += item.estimatedMonthlyCost * item.headcount;
  }

  return {
    totalHeadcount,
    totalMonthlyCost,
    totalAnnualCost: totalMonthlyCost * 12,
    itemsWithoutCost,
  };
}
