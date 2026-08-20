/**
 * What the progress ring on an initiative card shows — and, just as
 * importantly, WHICH fact it is showing.
 *
 * Three sources exist, in descending order of honesty:
 *
 *  1. `reported` — a percentage the owner actually recorded
 *     (`strategic_initiatives.progress_percent`, 20260820000008).
 *  2. `status`   — the initiative is marked done, so 100 is a real statement
 *     even though no percentage was typed.
 *  3. `elapsed`  — nothing was reported, but the initiative has a period, so
 *     the ring shows how much of that PERIOD has passed. This is time, not
 *     work, and the card labels it that way rather than passing it off as
 *     completion.
 *
 * When none of the three applies the ring is empty and says so, instead of
 * drawing a confident 0% that would read as "no work done".
 *
 * All date maths is string comparison on `YYYY-MM-DD` — no `new Date(iso)`
 * anywhere (that parse is UTC-based and shifts the calendar day backwards in
 * a negative-offset timezone, a bug this project already hit for real).
 */
export type InitiativeProgressKind = "reported" | "status" | "elapsed" | "none";

export interface InitiativeProgress {
  /** 0-100, rounded to a whole number. 0 when `kind` is "none". */
  percent: number;
  kind: InitiativeProgressKind;
}

export interface InitiativeProgressInput {
  progressPercent?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
  statusCode?: string | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  // Date.UTC with explicit numeric components — not a string parse.
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function initiativeProgress(input: InitiativeProgressInput, todayIso: string): InitiativeProgress {
  const reported = input.progressPercent == null ? null : Number(input.progressPercent);
  if (reported != null && Number.isFinite(reported)) {
    return { percent: Math.round(Math.min(100, Math.max(0, reported))), kind: "reported" };
  }

  if (input.statusCode === "done") return { percent: 100, kind: "status" };

  const { startDate, endDate } = input;
  if (startDate && endDate && ISO.test(startDate) && ISO.test(endDate) && ISO.test(todayIso)) {
    const span = daysBetween(startDate, endDate);
    // A single-day period is either not started or wholly past; there is no
    // meaningful fraction of one day to report.
    if (span <= 0) return { percent: todayIso >= endDate ? 100 : 0, kind: "elapsed" };
    const gone = daysBetween(startDate, todayIso);
    const pct = (gone / span) * 100;
    return { percent: Math.round(Math.min(100, Math.max(0, pct))), kind: "elapsed" };
  }

  return { percent: 0, kind: "none" };
}
