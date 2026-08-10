/**
 * Filtering and ordering for the طلبات الاحتياج table.
 *
 * Kept out of the component so the rules are unit-testable and stated once:
 * the table itself only wires inputs to these functions. Both operate on
 * already-fetched rows in memory — the same convention as the vacancies and
 * job-titles tables, and correct here because `recruitment_requests`' RLS has
 * already decided which rows exist at all.
 */

import { includesIgnoringHamza } from "./arabicSearch";
import {
  requestStatusLabel,
  requestStatusSelfLabels,
  type RequestStatus,
} from "./recruitmentWorkflow";

/** The fields the table can search and order by. */
export interface RecruitmentRequestSortable {
  jobTitle: string;
  orgUnit: string;
  headcount: number;
  status: string;
  qualifications: string | null;
  createdAt: string;
}

export const REQUEST_SORT_OPTIONS = [
  "newest",
  "oldest",
  "jobTitle",
  "orgUnit",
  "headcountDesc",
  "headcountAsc",
  "status",
] as const;
export type RequestSortOption = (typeof REQUEST_SORT_OPTIONS)[number];

export const DEFAULT_REQUEST_SORT: RequestSortOption = "newest";

/**
 * Free-text match across what the reader can actually see (job title, org
 * unit, status label) plus the qualifications text, which is not a column but
 * is the natural thing to search a demand request by. Hamza-insensitive, so
 * "استاذ" finds "أستاذ" — the same helper every other search in this app uses.
 */
export function matchesRequestQuery(row: RecruitmentRequestSortable, query: string): boolean {
  const q = query.trim();
  if (q === "") return true;
  return (
    includesIgnoringHamza(row.jobTitle, q) ||
    includesIgnoringHamza(row.orgUnit, q) ||
    includesIgnoringHamza(row.qualifications ?? "", q) ||
    includesIgnoringHamza(requestStatusLabel(row.status), q) ||
    // A status can read differently to the person being waited on ("بانتظار
    // المراجعة" for HR). Typing what is actually ON YOUR SCREEN must find the
    // row — and the short form is not a substring of the long one ("المراجعة"
    // vs "مراجعة"), so it has to be matched in its own right.
    includesIgnoringHamza(requestStatusSelfLabels[row.status as RequestStatus] ?? "", q)
  );
}

export function filterRequests<T extends RecruitmentRequestSortable>(
  rows: T[],
  options: { query?: string; status?: string }
): T[] {
  const { query = "", status = "" } = options;
  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    return matchesRequestQuery(row, query);
  });
}

/**
 * Sorting never mutates the input array. Arabic text is compared with
 * `localeCompare(..., "ar")` rather than raw code-point order, which would
 * put "إ" and "ا" in surprising places.
 */
export function sortRequests<T extends RecruitmentRequestSortable>(
  rows: T[],
  sort: RequestSortOption
): T[] {
  const copy = [...rows];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "jobTitle":
      return copy.sort((a, b) => a.jobTitle.localeCompare(b.jobTitle, "ar"));
    case "orgUnit":
      return copy.sort((a, b) => a.orgUnit.localeCompare(b.orgUnit, "ar"));
    case "headcountDesc":
      return copy.sort((a, b) => b.headcount - a.headcount);
    case "headcountAsc":
      return copy.sort((a, b) => a.headcount - b.headcount);
    case "status":
      // Grouped by the status's own Arabic label, so equal statuses sit
      // together in an order a reader recognises.
      return copy.sort((a, b) =>
        requestStatusLabel(a.status).localeCompare(requestStatusLabel(b.status), "ar")
      );
    case "newest":
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function isRequestSortOption(value: string): value is RequestSortOption {
  return (REQUEST_SORT_OPTIONS as readonly string[]).includes(value);
}
