/**
 * `vacancies.status` is plain TEXT in the database (20260719000007
 * deliberately added no CHECK enum — no documented vocabulary existed), so
 * these are the values the UI offers, not a constraint. Anything else
 * already stored (e.g. imported from Excel) still renders as-is rather than
 * blanking out — same fallback discipline as `recruitmentItemStatusLabel`.
 */
export const vacancyStatuses = ["open", "closed", "filled"] as const;
export type VacancyStatus = (typeof vacancyStatuses)[number];

/** Fixed Arabic domain vocabulary, same convention as `evaluationStateLabels`. */
export const vacancyStatusLabels: Record<VacancyStatus, string> = {
  open: "مفتوح",
  closed: "مغلق",
  filled: "تم شغله",
};

export function vacancyStatusLabel(status: string): string {
  return vacancyStatusLabels[status as VacancyStatus] ?? status;
}

export interface VacancyStatusCounts {
  open: number;
  closed: number;
  filled: number;
  other: number;
  total: number;
}

/**
 * Summary counts for the list header. An unrecognized status lands in
 * `other` instead of being dropped, so the parts always add up to `total`.
 */
export function countVacancyStatuses(statuses: string[]): VacancyStatusCounts {
  const counts: VacancyStatusCounts = { open: 0, closed: 0, filled: 0, other: 0, total: statuses.length };
  for (const status of statuses) {
    if (status === "open" || status === "closed" || status === "filled") counts[status] += 1;
    else counts.other += 1;
  }
  return counts;
}
