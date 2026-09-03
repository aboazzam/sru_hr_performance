import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateCompetencyScores,
  groupCompletionStats,
  visibleGroupBreakdown,
  type ThreeSixtyRaterGroup,
} from "@/lib/threeSixty";

export interface ThreeSixtyReportData {
  cycle: { id: string; nameAr: string; anonymityMode: "anonymous" | "identified" };
  overallScore: number | null;
  competencyBreakdown: { competencyId: string; nameAr: string; score: number }[];
  groupBreakdown: { relationshipCode: string; nameAr: string; total: number; submitted: number }[];
  foldedGroupCount: number;
  openTextComments: { itemText: string; answer: string }[];
}

/**
 * Screens 4/5's shared data assembly -- one function so an employee's own
 * report and a manager's view of a team member's report can never drift
 * apart (the exact "a fix landing in only one of two places" trap this
 * project has hit before). Returns null when there is nothing to show
 * (no closed cycle, or the cycle has no assignments for this employee).
 *
 * Anonymity: `visibleGroupBreakdown` (src/lib/threeSixty.ts) folds any
 * rater group that hasn't cleared its own `min_raters_in_group`
 * k-anonymity floor into an aggregate "other" bucket instead of showing it
 * on its own -- see that function's own doc comment. Open-text comments are
 * listed WITHOUT any rater attribution regardless of `anonymity_mode`:
 * resolving "which of several possible raters wrote this" would need a
 * general-purpose profile-name lookup this module deliberately does not
 * build (every name-resolution RPC added this session is narrowly scoped
 * to a specific, already-authorized relationship) -- flagged as a
 * known, deliberate simplification rather than silently pretending
 * `anonymity_mode = 'identified'` is fully implemented.
 */
export async function getThreeSixtyReport(
  supabase: SupabaseClient,
  employeeId: string,
  cycleId?: string
): Promise<ThreeSixtyReportData | null> {
  const cycleQuery = supabase
    .from("three_sixty_cycles")
    .select("id, name_ar, anonymity_mode")
    .eq("status", "closed")
    .is("deleted_at", null);
  const { data: cycle } = cycleId
    ? await cycleQuery.eq("id", cycleId).maybeSingle()
    : await cycleQuery.order("end_date", { ascending: false }).limit(1).maybeSingle();

  if (!cycle) return null;

  const { data: assignments } = await supabase
    .from("three_sixty_assignments")
    .select("id, relationship_code, status")
    .eq("cycle_id", cycle.id)
    .eq("subject_employee_id", employeeId)
    .is("deleted_at", null);

  if (!assignments || assignments.length === 0) return null;

  const { data: raterGroupRows } = await supabase
    .from("three_sixty_rater_groups")
    .select("relationship_code, name_ar, min_raters_in_group, max_raters_in_group, shown_separately, employee_may_nominate")
    .is("deleted_at", null);
  const raterGroups: ThreeSixtyRaterGroup[] = (raterGroupRows ?? []).map((g) => ({
    relationshipCode: g.relationship_code,
    nameAr: g.name_ar,
    minRatersInGroup: g.min_raters_in_group,
    maxRatersInGroup: g.max_raters_in_group,
    shownSeparately: g.shown_separately,
    employeeMayNominate: g.employee_may_nominate,
  }));
  const nameByCode = new Map(raterGroups.map((g) => [g.relationshipCode, g.nameAr]));

  const stats = groupCompletionStats(
    assignments.map((a) => ({ relationshipCode: a.relationship_code, status: a.status as "pending" | "submitted" | "excluded" }))
  );
  const { visible, folded } = visibleGroupBreakdown(raterGroups, stats);

  const submittedAssignmentIds = assignments.filter((a) => a.status === "submitted").map((a) => a.id);
  if (submittedAssignmentIds.length === 0) {
    return {
      cycle: { id: cycle.id, nameAr: cycle.name_ar, anonymityMode: cycle.anonymity_mode },
      overallScore: null,
      competencyBreakdown: [],
      groupBreakdown: visible.map((s) => ({ relationshipCode: s.relationshipCode, nameAr: nameByCode.get(s.relationshipCode) ?? s.relationshipCode, total: s.total, submitted: s.submitted })),
      foldedGroupCount: folded.length,
      openTextComments: [],
    };
  }

  const { data: responseRows } = await supabase
    .from("three_sixty_responses")
    .select(
      "option_id, numeric_value, text_value, three_sixty_items(competency_id, item_type, reverse_scored, scale_code, text_ar, three_sixty_competencies(name_ar))"
    )
    .in("assignment_id", submittedAssignmentIds);

  const { data: scaleRows } = await supabase
    .from("three_sixty_rating_scale_options")
    .select("id, scale_code, numeric_value, counted_in_score")
    .is("deleted_at", null);
  const scaleBoundsByCode = new Map<string, { min: number; max: number }>();
  // Keyed by option id, not scale_code+numeric_value -- counted_in_score is a
  // per-OPTION flag (e.g. an "N/A" option with counted_in_score=false), not
  // derivable from the scale's numeric bounds.
  const countedByOptionId = new Map<string, boolean>();
  for (const row of scaleRows ?? []) {
    const bounds = scaleBoundsByCode.get(row.scale_code) ?? { min: row.numeric_value, max: row.numeric_value };
    bounds.min = Math.min(bounds.min, row.numeric_value);
    bounds.max = Math.max(bounds.max, row.numeric_value);
    scaleBoundsByCode.set(row.scale_code, bounds);
    countedByOptionId.set(row.id, row.counted_in_score);
  }

  const scored: { competencyId: string; numericValue: number; reverseScored: boolean; scaleMin: number; scaleMax: number; countedInScore: boolean }[] = [];
  const competencyNameById = new Map<string, string>();
  const openTextComments: { itemText: string; answer: string }[] = [];

  for (const row of responseRows ?? []) {
    const item = row.three_sixty_items as unknown as {
      competency_id: string;
      item_type: "rating" | "open_text";
      reverse_scored: boolean;
      scale_code: string | null;
      text_ar: string;
      three_sixty_competencies: { name_ar: string } | null;
    } | null;
    if (!item) continue;
    competencyNameById.set(item.competency_id, item.three_sixty_competencies?.name_ar ?? item.competency_id);

    if (item.item_type === "open_text") {
      if (row.text_value) openTextComments.push({ itemText: item.text_ar, answer: row.text_value });
      continue;
    }
    if (row.numeric_value == null || !item.scale_code) continue;
    const bounds = scaleBoundsByCode.get(item.scale_code) ?? { min: row.numeric_value, max: row.numeric_value };
    // Defaults to true (counted) only when the option can't be resolved at
    // all (e.g. a stale/deleted option) -- a real, live option's own flag
    // always wins, so an "N/A"-style option marked counted_in_score=false
    // is correctly excluded instead of silently averaged in.
    const countedInScore = row.option_id ? (countedByOptionId.get(row.option_id) ?? true) : true;
    scored.push({
      competencyId: item.competency_id,
      numericValue: row.numeric_value,
      reverseScored: item.reverse_scored,
      scaleMin: bounds.min,
      scaleMax: bounds.max,
      countedInScore,
    });
  }

  const perCompetency = aggregateCompetencyScores(scored);
  const competencyBreakdown = [...perCompetency.entries()].map(([competencyId, score]) => ({
    competencyId,
    nameAr: competencyNameById.get(competencyId) ?? competencyId,
    score,
  }));
  const overallScore =
    competencyBreakdown.length > 0
      ? competencyBreakdown.reduce((sum, c) => sum + c.score, 0) / competencyBreakdown.length
      : null;

  return {
    cycle: { id: cycle.id, nameAr: cycle.name_ar, anonymityMode: cycle.anonymity_mode },
    overallScore,
    competencyBreakdown,
    groupBreakdown: visible.map((s) => ({
      relationshipCode: s.relationshipCode,
      nameAr: nameByCode.get(s.relationshipCode) ?? s.relationshipCode,
      total: s.total,
      submitted: s.submitted,
    })),
    foldedGroupCount: folded.length,
    openTextComments,
  };
}
