/**
 * The month strip on an initiative card.
 *
 * The real cards supplied by the project owner draw a row of month columns —
 * M7…M12 of 2024 followed by M1…M7 of 2025 on one, M1…M12 of 2026 on another
 * — grouped under year headers, with each activity shaded across the months
 * it runs. This module derives that strip from plain dates so the card can be
 * rendered (and printed) without storing a grid.
 *
 * Everything here is string arithmetic on `YYYY-MM-DD`. `new Date(iso)` is
 * deliberately avoided: it parses as UTC midnight and shifts the calendar day
 * backwards in a negative-offset timezone — a bug this project already hit
 * for real in the org-structure Excel import.
 */

export interface TimelineMonth {
  year: number;
  month: number;
  /** "2026-03" — stable key for React and for range comparisons. */
  key: string;
}

export interface TimelineYearGroup {
  year: number;
  months: TimelineMonth[];
}

/** `YYYY-MM-DD` (or `YYYY-MM`) -> {year, month}; null when unusable. */
export function monthOf(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/**
 * Every month from `from` to `to` inclusive. Returns [] when either bound is
 * unusable or the range is inverted — the caller then simply draws no strip,
 * which is the honest outcome for a card whose dates are still "TBD" (as most
 * of the real cards' dates are).
 *
 * Capped at 120 months so a typo like 2026 → 2260 cannot render a table with
 * thousands of columns.
 */
export function monthsBetween(fromIso: string | null | undefined, toIso: string | null | undefined): TimelineMonth[] {
  const from = monthOf(fromIso);
  const to = monthOf(toIso);
  if (!from || !to) return [];
  const start = monthIndex(from.year, from.month);
  const end = monthIndex(to.year, to.month);
  if (end < start) return [];

  const months: TimelineMonth[] = [];
  for (let i = start; i <= end && months.length < 120; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    months.push({ year, month, key: `${year}-${String(month).padStart(2, "0")}` });
  }
  return months;
}

/** Groups the strip under year headers, the way the cards present it. */
export function groupByYear(months: TimelineMonth[]): TimelineYearGroup[] {
  const groups: TimelineYearGroup[] = [];
  for (const month of months) {
    const last = groups[groups.length - 1];
    if (last && last.year === month.year) last.months.push(month);
    else groups.push({ year: month.year, months: [month] });
  }
  return groups;
}

/** True when the activity's own range covers this month. */
export function coversMonth(
  activity: { startDate: string | null; endDate: string | null },
  month: TimelineMonth
): boolean {
  const start = monthOf(activity.startDate);
  const end = monthOf(activity.endDate);
  if (!start && !end) return false;
  const cell = monthIndex(month.year, month.month);
  // A one-sided range means THAT month only, never "from here onwards":
  // shading the rest of the strip would claim months the owning department
  // never committed to. (Caught by the unit test — the first version let a
  // missing end date shade every later month.)
  const from = start ? monthIndex(start.year, start.month) : monthIndex(end!.year, end!.month);
  const to = end ? monthIndex(end.year, end.month) : from;
  return cell >= from && cell <= to;
}

/**
 * The strip the card should draw: the initiative's own period when it has
 * one, otherwise the span its activities actually cover — so a card whose
 * dates are still "TBD" still shows a timeline once its activities are
 * scheduled, instead of an empty band.
 */
export function timelineFor(
  initiative: { startDate: string | null; endDate: string | null },
  activities: Array<{ startDate: string | null; endDate: string | null }>
): TimelineMonth[] {
  const own = monthsBetween(initiative.startDate, initiative.endDate);
  if (own.length > 0) return own;

  const starts = activities.map((a) => a.startDate).filter((v): v is string => Boolean(v));
  const ends = activities.map((a) => a.endDate ?? a.startDate).filter((v): v is string => Boolean(v));
  if (starts.length === 0 || ends.length === 0) return [];
  const earliest = starts.slice().sort()[0];
  const latest = ends.slice().sort()[ends.length - 1];
  return monthsBetween(earliest, latest);
}

/**
 * Each month is drawn as FOUR weeks (2026-08-21 request) — the same split the
 * real initiative cards use, and they say so on the card itself: "تم تقسيم
 * الشهر إلى 4 أسابيع لتوفير تفاصيل أكثر دقة لأنشطة الجدول الزمني".
 *
 * The split is by day-of-month, not by ISO calendar week: days 1-7, 8-14,
 * 15-21, and 22-end. A calendar week would straddle two months and could not
 * be drawn under a single month header at all, and the fourth block absorbing
 * the 29th-31st is exactly how the printed cards read.
 */
export const WEEKS_PER_MONTH = 4;

/** Inclusive day range [from, to] of one week block within a month. */
export function weekDayRange(week: number): { from: number; to: number } {
  const from = week * 7 + 1;
  // The last block runs to the end of the month, whatever its length.
  return { from, to: week === WEEKS_PER_MONTH - 1 ? 31 : from + 6 };
}

function dayOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(iso.trim());
  return m ? Number(m[1]) : null;
}

/**
 * True when the activity runs through this week block of this month.
 *
 * Same one-sided rule as `coversMonth`: a range with only one end covers that
 * single point, never "from here onwards" — an activity must not claim weeks
 * nobody committed to.
 */
export function coversWeek(
  activity: { startDate: string | null; endDate: string | null },
  month: TimelineMonth,
  week: number
): boolean {
  if (!coversMonth(activity, month)) return false;

  const startMonth = monthOf(activity.startDate);
  const endMonth = monthOf(activity.endDate);
  const { from, to } = weekDayRange(week);

  // Inside a month the activity merely passes through, every week is covered.
  const startsHere = startMonth != null && startMonth.year === month.year && startMonth.month === month.month;
  const endsHere = endMonth != null && endMonth.year === month.year && endMonth.month === month.month;
  if (!startsHere && !endsHere) return true;

  const startDay = startsHere ? dayOf(activity.startDate) ?? 1 : 1;
  const endDay = endsHere ? dayOf(activity.endDate) ?? 31 : 31;
  // Overlap between [startDay, endDay] and this week block.
  return startDay <= to && endDay >= from;
}
