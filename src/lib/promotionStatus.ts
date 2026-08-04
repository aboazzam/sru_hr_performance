/**
 * `promotions.status` is plain TEXT in the database (20260719000005 added no
 * CHECK enum — no documented vocabulary existed). `reviewPromotion` only
 * ever writes 'approved'/'rejected' and the DB default is 'pending', so
 * these three are the real values; anything else still renders as-is.
 */
export const promotionStatuses = ["pending", "approved", "rejected"] as const;
export type PromotionStatus = (typeof promotionStatuses)[number];

/** Fixed Arabic domain vocabulary, same convention as `evaluationStateLabels`. */
export const promotionStatusLabels: Record<PromotionStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمدة",
  rejected: "مرفوضة",
};

export function promotionStatusLabel(status: string): string {
  return promotionStatusLabels[status as PromotionStatus] ?? status;
}

export interface PromotionStatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  other: number;
  total: number;
}

/** Summary counts; an unrecognized status lands in `other` so the parts add up. */
export function countPromotionStatuses(statuses: string[]): PromotionStatusCounts {
  const counts: PromotionStatusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    other: 0,
    total: statuses.length,
  };
  for (const status of statuses) {
    if (status === "pending" || status === "approved" || status === "rejected") counts[status] += 1;
    else counts.other += 1;
  }
  return counts;
}

/**
 * Whether a from -> to job-title move is a step the university's own career
 * ladder actually defines. `career_path` holds 155+ real edges (populated
 * from the real Career Path workbook), so a proposal can be checked against
 * it instead of being taken on trust.
 *
 * Returns `"unknown"` when the proposal has no `from` title at all (a real
 * case: `promotions.from_job_title_id` is nullable, e.g. an employee with no
 * job title recorded yet) — deliberately NOT reported as "off-path", since
 * there is nothing to judge it against.
 */
export type CareerPathMatch = "on_path" | "off_path" | "unknown";

export function classifyPromotionAgainstCareerPath(
  fromJobTitleId: string | null,
  toJobTitleId: string | null,
  edges: Array<{ fromJobTitleId: string; toJobTitleId: string }>
): CareerPathMatch {
  if (!fromJobTitleId || !toJobTitleId) return "unknown";
  return edges.some((e) => e.fromJobTitleId === fromJobTitleId && e.toJobTitleId === toJobTitleId)
    ? "on_path"
    : "off_path";
}

/** The job titles the career ladder defines as the next step after `fromJobTitleId`. */
export function nextCareerSteps(
  fromJobTitleId: string | null,
  edges: Array<{ fromJobTitleId: string; toJobTitleId: string }>
): string[] {
  if (!fromJobTitleId) return [];
  return edges.filter((e) => e.fromJobTitleId === fromJobTitleId).map((e) => e.toJobTitleId);
}
