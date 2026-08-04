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
