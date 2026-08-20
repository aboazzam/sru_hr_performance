/**
 * Day / month-name / year date handling for the app's own date control.
 *
 * A native `<input type="date">` renders in the browser's own locale format
 * (the project owner saw `08 / 09 / 2026`, which is ambiguous between
 * day-month and month-day) and that display CANNOT be changed by CSS or by
 * any attribute — it is drawn by the browser. So the app renders its own
 * three-part control instead, showing the month as a NAME:
 * `03 / أكتوبر / 2026`.
 *
 * Everything here is string arithmetic on `YYYY-MM-DD`. No `new Date(iso)`
 * anywhere — that parse is UTC-based and shifts the calendar day backwards in
 * a negative-offset timezone, a bug this project already hit for real once in
 * the org-structure Excel import.
 */

export interface DateParts {
  /** 1-31 */
  day: number;
  /** 1-12 */
  month: number;
  year: number;
}

/** Gregorian month names as written in Saudi usage, matching the app's Arabic-first UI. */
export const monthNamesAr = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

export const monthNamesEn = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthNames(locale: string): readonly string[] {
  return locale === "en" ? monthNamesEn : monthNamesAr;
}

/** Days in a Gregorian month; February follows the real leap-year rule. */
/**
 * Names for the three parts of the control. They are used as the EMPTY
 * option of each select, so an unset date reads `اليوم / الشهر / السنة`
 * rather than three identical dashes that give the reader no way to tell
 * which box is which before opening it.
 */
export function datePartLabels(locale: string): { day: string; month: string; year: string } {
  return locale === "en"
    ? { day: "Day", month: "Month", year: "Year" }
    : { day: "اليوم", month: "الشهر", year: "السنة" };
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** `YYYY-MM-DD` -> parts, or null for an empty/malformed value. */
export function parseDateParts(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Parts -> `YYYY-MM-DD`, or "" when the date is not complete yet (any part
 * still unchosen). The day is CLAMPED to the month's real length, so picking
 * 31 and then switching to a 30-day month yields the 30th rather than an
 * impossible date the DB would reject.
 */
export function formatDateValue(parts: Partial<DateParts>): string {
  const { year, month, day } = parts;
  if (!year || !month || !day) return "";
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/**
 * Human display: `5 أغسطس 2026` — the exact shape the project owner asked
 * for: day, month NAME, year, separated by spaces, with no leading zero and
 * no slashes (an earlier `03/أكتوبر/2026` draft was superseded by this).
 * Same part order in both locales, so a value never reads ambiguously.
 */
export function formatDateDmy(value: string | null | undefined, locale: string): string {
  const parts = parseDateParts(value);
  if (!parts) return "—";
  const names = monthNames(locale);
  return `${parts.day} ${names[parts.month - 1]} ${parts.year}`;
}

/** Selectable years for the pickers: last year through ten years ahead. */
export function yearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = currentYear - 1; y <= currentYear + 10; y += 1) years.push(y);
  return years;
}

/**
 * Weekday names for the calendar grid header, Sunday first (the week start
 * used across Saudi calendars).
 */
export function weekdayNamesShort(locale: string): readonly string[] {
  return locale === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
}

/**
 * Weekday index (0 = Sunday) of the first day of a month.
 *
 * `Date.UTC` with explicit numeric components is safe here — unlike
 * `new Date("2026-08-05")`, which parses a STRING as UTC midnight and then
 * reads back a shifted local day. Nothing here ever parses a date string.
 */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/**
 * The month laid out as calendar weeks: 7 cells per row, `null` where the
 * grid spills before the 1st or past the last day.
 */
export function monthGrid(year: number, month: number): Array<Array<number | null>> {
  const lead = firstWeekdayOfMonth(year, month);
  const days = daysInMonth(year, month);
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Step a (year, month) pair by whole months, rolling the year over. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Today as `YYYY-MM-DD` in a named IANA timezone.
 *
 * `en-CA` formats as an ISO-like date, which is why it is used rather than
 * assembling parts by hand. The timezone matters: without it the server's own
 * zone decides, and "today" would flip a day early or late for the reader.
 */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
