/**
 * Date helpers for an evaluation cycle's period (`evaluation_cycles.start_date`
 * / `end_date`).
 *
 * All arithmetic is done on the ISO "YYYY-MM-DD" string's own parts, never via
 * `new Date(string)` — parsing a bare date string yields a UTC midnight that
 * renders as the previous calendar day in any negative-offset timezone, a real
 * bug this project already hit once in the org-structure Excel import.
 *
 * There is no `duration` column: a cycle's duration is simply the span between
 * its two dates. These helpers let the form offer the usual presets (3/6/9/12
 * months) and describe whatever span the two dates actually produce.
 */

export const CYCLE_DURATION_PRESETS = [3, 6, 9, 12] as const;
export type CycleDurationPreset = (typeof CYCLE_DURATION_PRESETS)[number];

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIso({ year, month, day }: DateParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Adds whole calendar months, clamping the day to the target month's length
 * (31 Jan + 1 month = 28/29 Feb, the same rule every calendar app uses).
 */
export function addMonths(iso: string, months: number): string | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  const zeroBased = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  return toIso({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}

function addDays(iso: string, days: number): string | null {
  const parts = parseIsoDate(iso);
  if (!parts) return null;
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day) + days * 86_400_000;
  const date = new Date(utc);
  return toIso({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

/**
 * The end date for a period of `months` starting at `startIso` — the day
 * BEFORE the same date N months later, so a 12-month cycle starting
 * 2026-01-01 ends 2026-12-31, not 2027-01-01.
 */
export function computeEndDate(startIso: string, months: number): string | null {
  const shifted = addMonths(startIso, months);
  return shifted ? addDays(shifted, -1) : null;
}

/**
 * Describes the span the two dates actually produce: the inclusive day count,
 * plus the whole-month count when the range matches a `computeEndDate` period
 * exactly (so a hand-picked 2026-01-01 → 2026-12-31 still reads as 12 months).
 * Returns null when either date is unparsable or the end is not after the start
 * — the same condition `evaluation_cycles_dates_valid` enforces in Postgres.
 */
export function describeCycleDuration(
  startIso: string,
  endIso: string
): { days: number; months: number | null } | null {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return null;

  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  if (endUtc <= startUtc) return null;

  const days = Math.round((endUtc - startUtc) / 86_400_000) + 1;

  let months: number | null = null;
  const approx = (end.year - start.year) * 12 + (end.month - start.month);
  for (const candidate of [approx, approx + 1]) {
    if (candidate > 0 && computeEndDate(startIso, candidate) === endIso) {
      months = candidate;
      break;
    }
  }

  return { days, months };
}
