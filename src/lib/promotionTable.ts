/**
 * Filtering for the الترقيات table.
 *
 * Extracted from `PromotionsTable` (2026-08-08) when the Excel export needed
 * to apply the EXACT same rules server-side — one implementation used by both
 * rather than two that could drift, and unit-testable on its own. Same split
 * as `vacancyTable.ts` / `recruitmentRequestTable.ts`.
 */

import { includesIgnoringHamza } from "./arabicSearch";

export interface PromotionFilterable {
  employeeNumber: string | null;
  employeeName: string | null;
  fromTitleName: string | null;
  toTitleName: string | null;
  status: string;
}

/**
 * Free-text match across what the reader can see: the employee (by name or
 * number) and both job titles. The number is matched as a plain substring —
 * hamza folding is meaningless for digits — while the names are
 * hamza-insensitive like every other search in this app.
 */
export function matchesPromotionQuery(row: PromotionFilterable, query: string): boolean {
  const q = query.trim();
  if (q === "") return true;
  return (
    includesIgnoringHamza(row.employeeName ?? "", q) ||
    (row.employeeNumber ?? "").includes(q) ||
    includesIgnoringHamza(row.fromTitleName ?? "", q) ||
    includesIgnoringHamza(row.toTitleName ?? "", q)
  );
}

export function filterPromotions<T extends PromotionFilterable>(
  rows: T[],
  options: { query?: string; status?: string }
): T[] {
  const { query = "", status = "" } = options;
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    return matchesPromotionQuery(row, query);
  });
}
