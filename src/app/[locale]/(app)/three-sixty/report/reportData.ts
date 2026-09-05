import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCompetencyGroupScores,
  computeCompetencyOfficialScores,
  computeItemGroupAverages,
  computeOverallScore,
  computeSelfGaps,
  excludeByTenure,
  groupCompletionStats,
  meetsMinRatersGate,
  rankItems,
  resolveThreeSixtyItemLevels,
  reverseAdjustedValue,
  shuffleOpenTextAnswers,
  visibleGroupBreakdown,
  type BehavioralLevel,
  type CompetencyGap,
  type ItemScore,
  type PreparedResponse,
  type ThreeSixtyAssignmentStatus,
  type ThreeSixtyCompetency,
  type ThreeSixtyRaterGroup,
} from "@/lib/threeSixty";

export interface CompetencyReportRow {
  competencyId: string;
  nameAr: string;
  weightPct: number | null;
  /** null = no countable data for this competency at all (e.g. every response was "لم ألاحظ"). */
  score: number | null;
  /** Only groups that clear BOTH shown_separately and the min_raters_in_group k-anonymity floor. */
  byGroup: { relationshipCode: string; nameAr: string; score: number | null }[];
  hasFoldedGroups: boolean;
}

export interface ThreeSixtyReportData {
  cycle: { id: string; nameAr: string; anonymityMode: "anonymous" | "identified" };
  insufficientData: boolean;
  completedRaters: number;
  minRatersRequired: number;
  overallScore: number | null;
  competencies: CompetencyReportRow[];
  selfGaps: CompetencyGap[];
  topItems: ItemScore[];
  bottomItems: ItemScore[];
  groupCompletion: { relationshipCode: string; nameAr: string; total: number; submitted: number }[];
  /** Pooled, shuffled, with no item/category/date/order attached -- see threeSixty.ts's `shuffleOpenTextAnswers`. */
  openTextAnswers: string[];
}

/**
 * Screens 4/5's shared data assembly (2026-09-04 rewrite, literal scoring
 * rules given directly by the project owner -- see src/lib/threeSixty.ts's
 * own header for the full pipeline) -- one function so an employee's own
 * report and a manager's view of a team member's report can never drift
 * apart (the exact "a fix landing in only one of two places" trap this
 * project has hit before). Returns null when there is nothing to show at
 * all (no closed cycle, or the cycle has no assignments for this employee)
 * -- NOT the same as `insufficientData: true`, which means real assignments
 * exist but too few scoring-group raters completed theirs.
 *
 * Confidentiality, applied at every step: no field returned here ever
 * carries a rater's identity (only aggregated scores/counts); a rater
 * group's own breakdown is included in `byGroup` only once it clears
 * `min_raters_in_group` (k-anonymity) -- folded otherwise (`hasFoldedGroups`
 * says so without naming which); `openTextAnswers` is a flat, shuffled list
 * with no item/category/date attached.
 */
export async function getThreeSixtyReport(
  supabase: SupabaseClient,
  employeeId: string,
  cycleId?: string
): Promise<ThreeSixtyReportData | null> {
  const cycleQuery = supabase
    .from("three_sixty_cycles")
    .select("id, name_ar, anonymity_mode, min_raters, min_months_together")
    .eq("status", "closed")
    .is("deleted_at", null);
  const { data: cycle } = cycleId
    ? await cycleQuery.eq("id", cycleId).maybeSingle()
    : await cycleQuery.order("end_date", { ascending: false }).limit(1).maybeSingle();
  if (!cycle) return null;

  const { data: assignmentRows } = await supabase
    .from("three_sixty_assignments")
    .select("id, relationship_code, status, months_worked_together")
    .eq("cycle_id", cycle.id)
    .eq("subject_employee_id", employeeId)
    .is("deleted_at", null);
  if (!assignmentRows || assignmentRows.length === 0) return null;

  const assignments = assignmentRows.map((a) => ({
    id: a.id,
    relationshipCode: a.relationship_code,
    status: a.status as ThreeSixtyAssignmentStatus,
    monthsWorkedTogether: a.months_worked_together,
  }));
  const tenureEligible = excludeByTenure(assignments, cycle.min_months_together);
  const relationshipByAssignmentId = new Map(tenureEligible.map((a) => [a.id, a.relationshipCode]));

  const { data: raterGroupRows } = await supabase
    .from("three_sixty_rater_groups")
    .select("relationship_code, name_ar, group_weight_pct, min_raters_in_group, max_raters_in_group, shown_separately, employee_may_nominate")
    .is("deleted_at", null);
  const raterGroups: ThreeSixtyRaterGroup[] = (raterGroupRows ?? []).map((g) => ({
    relationshipCode: g.relationship_code,
    nameAr: g.name_ar,
    groupWeightPct: g.group_weight_pct,
    minRatersInGroup: g.min_raters_in_group,
    maxRatersInGroup: g.max_raters_in_group,
    shownSeparately: g.shown_separately,
    employeeMayNominate: g.employee_may_nominate,
  }));
  const raterGroupByCode = new Map(raterGroups.map((g) => [g.relationshipCode, g]));

  const gate = meetsMinRatersGate(tenureEligible, raterGroups, cycle.min_raters);

  const completionStats = groupCompletionStats(tenureEligible);
  const { visible: visibleStats } = visibleGroupBreakdown(raterGroups, completionStats);
  const visibleCodes = new Set(visibleStats.map((s) => s.relationshipCode));
  const groupCompletion = completionStats.map((s) => ({
    relationshipCode: s.relationshipCode,
    nameAr: raterGroupByCode.get(s.relationshipCode)?.nameAr ?? s.relationshipCode,
    total: s.total,
    submitted: s.submitted,
  }));

  const [{ data: competencyRows }, { data: subjectLevelRows }] = await Promise.all([
    supabase.from("three_sixty_competencies").select("id, name_ar, weight_pct, source_competency_id, applies_to").is("deleted_at", null),
    // SECURITY DEFINER -- resolves which of the 16 "specialized" competencies
    // actually apply to this employee's job title (see migration
    // 20260905000001's header); this employee viewing their own report, or
    // their manager viewing it, both already satisfy the RPC's own
    // authorization check via the real assignment rows fetched above.
    supabase.rpc("get_three_sixty_subject_levels", { p_subject_employee_id: employeeId }),
  ]);
  const resolvedCompetencyLevels = resolveThreeSixtyItemLevels(
    (competencyRows ?? []).map((c) => ({
      id: c.id,
      sourceCompetencyId: c.source_competency_id,
      appliesTo: (c.applies_to as "all" | "specialized" | null) ?? "all",
    })),
    ((subjectLevelRows ?? []) as { competency_id: string; required_level: BehavioralLevel }[]).map((r) => ({
      competencyId: r.competency_id,
      requiredLevel: r.required_level,
    }))
  );
  // A "specialized" competency this employee's job title never required is
  // excluded from the report entirely -- not shown as a row with no score,
  // which would misleadingly read as "assessed but scoreless" rather than
  // "does not apply to you".
  const competencies: ThreeSixtyCompetency[] = (competencyRows ?? [])
    .filter((c) => resolvedCompetencyLevels.has(c.id))
    .map((c) => ({
      id: c.id,
      nameAr: c.name_ar,
      weightPct: c.weight_pct,
    }));

  if (!gate.ok) {
    return {
      cycle: { id: cycle.id, nameAr: cycle.name_ar, anonymityMode: cycle.anonymity_mode },
      insufficientData: true,
      completedRaters: gate.completedCount,
      minRatersRequired: cycle.min_raters,
      overallScore: null,
      competencies: [],
      selfGaps: [],
      topItems: [],
      bottomItems: [],
      groupCompletion,
      openTextAnswers: [],
    };
  }

  const submittedIds = tenureEligible.filter((a) => a.status === "submitted").map((a) => a.id);

  const { data: itemRows } = await supabase
    .from("three_sixty_items")
    .select("id, competency_id, item_type, reverse_scored, scale_code, text_ar")
    .is("deleted_at", null);
  const items = itemRows ?? [];
  const ratingItems = items.filter((i) => i.item_type === "rating");
  const itemById = new Map(items.map((i) => [i.id, i]));

  const { data: responseRows } = await supabase
    .from("three_sixty_responses")
    .select("assignment_id, item_id, option_id, numeric_value, text_value")
    .in("assignment_id", submittedIds);

  const { data: scaleRows } = await supabase
    .from("three_sixty_rating_scale_options")
    .select("id, scale_code, numeric_value, counted_in_score")
    .is("deleted_at", null);
  // Bounds are derived ONLY from counted_in_score=true options -- a "لم
  // ألاحظ"/N/A option's own numeric_value (often 0, outside the real rating
  // range) must not shift where reverseAdjustedValue mirrors a reverse-scored
  // item's raw value, even though that same option is separately (and
  // correctly) excluded from every average below.
  const scaleBoundsByCode = new Map<string, { min: number; max: number }>();
  const countedByOptionId = new Map<string, boolean>();
  for (const row of scaleRows ?? []) {
    countedByOptionId.set(row.id, row.counted_in_score);
    if (!row.counted_in_score) continue;
    const bounds = scaleBoundsByCode.get(row.scale_code) ?? { min: row.numeric_value, max: row.numeric_value };
    bounds.min = Math.min(bounds.min, row.numeric_value);
    bounds.max = Math.max(bounds.max, row.numeric_value);
    scaleBoundsByCode.set(row.scale_code, bounds);
  }

  const prepared: PreparedResponse[] = [];
  const openTextAnswersRaw: string[] = [];
  for (const row of responseRows ?? []) {
    const item = itemById.get(row.item_id);
    if (!item) continue;
    const relationshipCode = relationshipByAssignmentId.get(row.assignment_id);
    if (!relationshipCode) continue; // tenure-excluded or unrelated assignment
    if (item.item_type === "open_text") {
      if (row.text_value && row.text_value.trim() !== "") openTextAnswersRaw.push(row.text_value.trim());
      continue;
    }
    if (row.numeric_value == null || !item.scale_code) continue;
    // "خيار counted_in_score = N يُستبعد من المتوسط ولا يُعامل كصفر" -- an
    // unresolved option id defaults to counted (true), never silently drops
    // real data because of a stale/deleted option row.
    const counted = row.option_id ? countedByOptionId.get(row.option_id) ?? true : true;
    const bounds = scaleBoundsByCode.get(item.scale_code) ?? { min: row.numeric_value, max: row.numeric_value };
    prepared.push({
      itemId: row.item_id,
      competencyId: item.competency_id,
      relationshipCode,
      adjustedValue: counted ? reverseAdjustedValue(row.numeric_value, bounds.min, bounds.max, item.reverse_scored) : null,
    });
  }

  const itemGroupAverages = computeItemGroupAverages(prepared);
  const competencyGroupScores = computeCompetencyGroupScores(
    itemGroupAverages,
    ratingItems.map((i) => ({ id: i.id, competencyId: i.competency_id }))
  );
  const competencyOfficialScores = computeCompetencyOfficialScores(competencyGroupScores, raterGroups);
  const overallScore = computeOverallScore(competencyOfficialScores, competencies);
  const selfGaps = computeSelfGaps(competencyGroupScores, competencyOfficialScores, competencies);
  const { top: topItems, bottom: bottomItems } = rankItems(
    itemGroupAverages,
    ratingItems.map((i) => ({ id: i.id, textAr: i.text_ar, competencyId: i.competency_id })),
    raterGroups
  );

  const competencyReportRows: CompetencyReportRow[] = competencies.map((c) => {
    const byGroupScores = competencyGroupScores.get(c.id);
    const byGroup = [...visibleCodes]
      .map((code) => ({
        relationshipCode: code,
        nameAr: raterGroupByCode.get(code)?.nameAr ?? code,
        score: byGroupScores?.get(code) ?? null,
      }))
      .filter((row) => row.score != null);
    const hasFoldedGroups = (byGroupScores?.size ?? 0) > byGroup.length;
    return {
      competencyId: c.id,
      nameAr: c.nameAr,
      weightPct: c.weightPct,
      score: competencyOfficialScores.get(c.id) ?? null,
      byGroup,
      hasFoldedGroups,
    };
  });

  return {
    cycle: { id: cycle.id, nameAr: cycle.name_ar, anonymityMode: cycle.anonymity_mode },
    insufficientData: false,
    completedRaters: gate.completedCount,
    minRatersRequired: cycle.min_raters,
    overallScore,
    competencies: competencyReportRows,
    selfGaps,
    topItems,
    bottomItems,
    groupCompletion,
    openTextAnswers: shuffleOpenTextAnswers(openTextAnswersRaw),
  };
}
