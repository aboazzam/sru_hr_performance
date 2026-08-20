/**
 * What belongs to an executive plan's window.
 *
 * Requested 2026-08-19: the executive plan's own tabs must show the strategic
 * plan's targets and initiatives, but "لا يظهر الا المبادرات المحددة في نفس
 * توقيت الخطة التنفيذية".
 *
 * TWO DECISIONS WORTH STATING, because both are judgement calls the request
 * does not settle on its own:
 *
 * 1. OVERLAP, not containment. An initiative running 2026-06 → 2027-06 is
 *    genuinely part of a 2026 plan's work even though it outlives it;
 *    requiring full containment would hide most real initiatives, since the
 *    supplied cards routinely span a year and a half. So anything whose
 *    period touches the window is in scope.
 *
 * 2. UNDATED ITEMS ARE NOT SILENTLY DROPPED. Most initiatives on the real
 *    cards still read "TBD" for both dates. Filtering them out would make
 *    them vanish from the executive plan with no explanation; they are
 *    returned separately so the screen can say "these have no dates yet"
 *    instead of pretending they do not exist.
 *
 * All comparisons are plain `YYYY-MM-DD` string comparisons — lexical order
 * equals chronological order for that format, and `new Date(iso)` is avoided
 * for the UTC-shift reason documented across this project.
 */

export interface DatedItem {
  startDate: string | null;
  endDate: string | null;
}

export interface PlanWindow {
  startDate: string;
  endDate: string;
}

export type ScopeVerdict = "in-window" | "outside-window" | "undated";

/**
 * Where an item sits relative to the plan window.
 *
 * A one-sided period is treated as an open interval on the missing side: an
 * initiative that started in 2025 with no end date is still running as far as
 * this plan knows, so it counts as in-window rather than being dismissed.
 * (Note this differs deliberately from the CARD's month strip, where a
 * missing end shades a single month only — there the question is "what did
 * the department commit to", here it is "is this still live".)
 */
export function classify(item: DatedItem, window: PlanWindow): ScopeVerdict {
  const { startDate, endDate } = item;
  if (!startDate && !endDate) return "undated";

  const from = startDate ?? endDate!;
  const to = endDate ?? null;

  // Starts after the window closes.
  if (from > window.endDate) return "outside-window";
  // Ends before the window opens (an open-ended item never does).
  if (to !== null && to < window.startDate) return "outside-window";
  return "in-window";
}

export function isInWindow(item: DatedItem, window: PlanWindow): boolean {
  return classify(item, window) === "in-window";
}

/**
 * Splits a list into what the executive plan should show, what falls outside
 * its window, and what has no dates at all — the three groups the screen
 * renders, so the page never has to re-derive the rule.
 */
export function splitByWindow<T extends DatedItem>(
  items: T[],
  window: PlanWindow
): { inWindow: T[]; outside: T[]; undated: T[] } {
  const inWindow: T[] = [];
  const outside: T[] = [];
  const undated: T[] = [];
  for (const item of items) {
    const verdict = classify(item, window);
    if (verdict === "in-window") inWindow.push(item);
    else if (verdict === "outside-window") outside.push(item);
    else undated.push(item);
  }
  return { inWindow, outside, undated };
}

/**
 * An annual target belongs to the plan when its evaluation cycle overlaps the
 * window — and, when the plan is tied to a specific cycle, when it IS that
 * cycle. The explicit link wins: a plan built on "دورة 2026" should show that
 * cycle's targets even if someone later edits the plan's dates.
 */
export function targetCycleInScope(
  cycle: { id: string; startDate: string | null; endDate: string | null },
  window: PlanWindow,
  planCycleId: string | null
): boolean {
  if (planCycleId) return cycle.id === planCycleId;
  return isInWindow({ startDate: cycle.startDate, endDate: cycle.endDate }, window);
}
