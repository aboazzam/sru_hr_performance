/**
 * Filtering and ordering for the نتائج الموظفين table (نتائج التقييم
 * module). Same split as `promotionTable.ts`/`vacancyTable.ts`: one pure
 * implementation used by both the live client-side table and the Excel
 * export route, so the two can never drift.
 */

import { includesIgnoringHamza } from "./arabicSearch";
import type { RatingBandId } from "./ratingBands";

export interface EvaluationResultFilterable {
  employeeNumber: string | null;
  employeeName: string | null;
  orgUnitName: string | null;
  bandId: RatingBandId | null;
}

/** Free-text match across employee name/number and department. Hamza-insensitive, like every other search in this app; the number is matched as a plain substring. */
export function matchesEvaluationResultQuery(row: EvaluationResultFilterable, query: string): boolean {
  const q = query.trim();
  if (q === "") return true;
  return (
    includesIgnoringHamza(row.employeeName ?? "", q) ||
    (row.employeeNumber ?? "").includes(q) ||
    includesIgnoringHamza(row.orgUnitName ?? "", q)
  );
}

export function filterEvaluationResults<T extends EvaluationResultFilterable>(
  rows: T[],
  options: { query?: string; bandId?: string }
): T[] {
  const { query = "", bandId = "" } = options;
  return rows.filter((row) => {
    if (bandId && row.bandId !== bandId) return false;
    return matchesEvaluationResultQuery(row, query);
  });
}

export const EVALUATION_RESULT_SORT_OPTIONS = ["scoreDesc", "scoreAsc", "nameAsc", "orgUnitAsc"] as const;
export type EvaluationResultSortOption = (typeof EVALUATION_RESULT_SORT_OPTIONS)[number];
export const DEFAULT_EVALUATION_RESULT_SORT: EvaluationResultSortOption = "scoreDesc";

export function isEvaluationResultSortOption(value: string): value is EvaluationResultSortOption {
  return (EVALUATION_RESULT_SORT_OPTIONS as readonly string[]).includes(value);
}

export interface EvaluationResultSortable {
  employeeName: string | null;
  orgUnitName: string | null;
  score: number | null;
}

/** Arabic collation, with an unnamed row always sorted last rather than first. */
function compareText(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "ar");
}

/** A missing score sorts last in both directions — "not yet scored" is not "zero". */
function compareScore(a: number | null, b: number | null, descending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

/** Never mutates the input array. */
export function sortEvaluationResults<T extends EvaluationResultSortable>(rows: T[], sort: EvaluationResultSortOption): T[] {
  const copy = [...rows];
  switch (sort) {
    case "scoreAsc":
      return copy.sort((a, b) => compareScore(a.score, b.score, false));
    case "nameAsc":
      return copy.sort((a, b) => compareText(a.employeeName, b.employeeName));
    case "orgUnitAsc":
      return copy.sort((a, b) => compareText(a.orgUnitName, b.orgUnitName));
    case "scoreDesc":
    default:
      return copy.sort((a, b) => compareScore(a.score, b.score, true));
  }
}
