/**
 * Filtering and ordering for the الشواغر table.
 *
 * The search/status filter used to live inline in `VacanciesTable`; it moved
 * here (2026-08-08) when the Excel export needed to apply the EXACT same rules
 * server-side. One implementation, used by both, and unit-testable — the same
 * split the طلبات الاحتياج table uses (`recruitmentRequestTable.ts`).
 */

import { includesIgnoringHamza } from "./arabicSearch";

export interface VacancyFilterable {
  jobTitleName: string | null;
  orgUnitName: string | null;
  requirementsAr: string | null;
  status: string;
}

export interface VacancySortable {
  jobTitleName: string | null;
  gradeLevel: number | null;
  orgUnitName: string | null;
  status: string;
  announced: boolean;
  createdAt: string;
}

/**
 * Free-text match across the three fields the reader can see on this screen.
 * Hamza-insensitive, like every other search in this app.
 */
export function matchesVacancyQuery(row: VacancyFilterable, query: string): boolean {
  const q = query.trim();
  if (q === "") return true;
  return (
    includesIgnoringHamza(row.jobTitleName ?? "", q) ||
    includesIgnoringHamza(row.orgUnitName ?? "", q) ||
    includesIgnoringHamza(row.requirementsAr ?? "", q)
  );
}

export function filterVacancies<T extends VacancyFilterable>(
  rows: T[],
  options: { query?: string; status?: string }
): T[] {
  const { query = "", status = "" } = options;
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    return matchesVacancyQuery(row, query);
  });
}

export const VACANCY_SORT_OPTIONS = [
  "newest",
  "oldest",
  "jobTitle",
  "orgUnit",
  "gradeDesc",
  "gradeAsc",
  "status",
  "announcedFirst",
] as const;
export type VacancySortOption = (typeof VACANCY_SORT_OPTIONS)[number];

export const DEFAULT_VACANCY_SORT: VacancySortOption = "newest";

export function isVacancySortOption(value: string): value is VacancySortOption {
  return (VACANCY_SORT_OPTIONS as readonly string[]).includes(value);
}

/** Arabic collation, with an unnamed row always sorted last rather than first. */
function compareText(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "ar");
}

/** A missing grade sorts last in both directions — "unknown" is not "zero". */
function compareGrade(a: number | null, b: number | null, descending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

/** Never mutates the input array. */
export function sortVacancies<T extends VacancySortable>(rows: T[], sort: VacancySortOption): T[] {
  const copy = [...rows];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "jobTitle":
      return copy.sort((a, b) => compareText(a.jobTitleName, b.jobTitleName));
    case "orgUnit":
      return copy.sort((a, b) => compareText(a.orgUnitName, b.orgUnitName));
    case "gradeDesc":
      return copy.sort((a, b) => compareGrade(a.gradeLevel, b.gradeLevel, true));
    case "gradeAsc":
      return copy.sort((a, b) => compareGrade(a.gradeLevel, b.gradeLevel, false));
    case "status":
      return copy.sort((a, b) => compareText(a.status, b.status));
    case "announcedFirst":
      // Advertised postings first, each group still newest-first inside itself
      // so the order stays meaningful rather than arbitrary.
      return copy.sort((a, b) => {
        if (a.announced !== b.announced) return a.announced ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
