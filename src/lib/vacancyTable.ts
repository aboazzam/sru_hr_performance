/**
 * Ordering for the الشواغر table.
 *
 * The search and status filter already live in `VacanciesTable` itself (they
 * predate this file); this adds the sort rules only, kept out of the component
 * so they can be unit-tested — the same split the طلبات الاحتياج table uses
 * (`recruitmentRequestTable.ts`).
 */

export interface VacancySortable {
  jobTitleName: string | null;
  gradeLevel: number | null;
  orgUnitName: string | null;
  status: string;
  announced: boolean;
  createdAt: string;
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
