import type { SupabaseClient } from "@supabase/supabase-js";
import { getThreeSixtyReport, type ThreeSixtyReportData } from "@/app/[locale]/(app)/three-sixty/report/reportData";

/**
 * The 360 report for one employee within one evaluation cycle, sourced from
 * the rich `three_sixty` module (2026-09-05). Before this,
 * `weight_feedback_360` on `evaluation_cycles` was wired to the old, simple
 * `feedback_360` table -- a completely separate system from the
 * `three_sixty_*` module this app actually builds new 360 cycles in, so a
 * completed 360 survey never once affected an employee's weighted
 * evaluation score. `three_sixty_cycles.evaluation_cycle_id` (added in
 * migration 20260905000002, 1:1, confirmed directly with the project owner)
 * is what closes that gap.
 *
 * One place for this lookup so `/evaluations/[id]` and `/employees/[id]`
 * can never drift apart on how the 360 leg is resolved -- the exact trap
 * this project has hit before with duplicated logic. Callers weighing the
 * cycle score MUST use `.overallScorePercent` (0-100, matching every other
 * evaluation method), never the raw `.overallScore` (whatever the cycle's
 * own rating scale range is, e.g. 0-5) -- mixing the two scales was a real
 * bug caught live while verifying this exact wiring. A page also showing
 * the pooled open-text feedback (e.g. `/evaluations/[id]`) uses
 * `.openTextAnswers` from the same report instead of a second,
 * separately-shaped query.
 *
 * Returns null when there is nothing to weigh yet: no 360 cycle has been
 * linked to this evaluation cycle, the linked cycle hasn't closed, or the
 * caller's own RLS doesn't expose responses for it (each table's own RLS
 * decides, the same established precedent already applied to goals/BAU-task
 * visibility elsewhere on these pages) -- `weightedCycleScore` already
 * treats a missing method as excluded-and-renormalised, not a zero.
 */
export async function resolveThreeSixtyReportForEvaluationCycle(
  supabase: SupabaseClient,
  evaluationCycleId: string,
  employeeId: string
): Promise<ThreeSixtyReportData | null> {
  const { data: linked } = await supabase
    .from("three_sixty_cycles")
    .select("id")
    .eq("evaluation_cycle_id", evaluationCycleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!linked) return null;

  return getThreeSixtyReport(supabase, employeeId, linked.id);
}
