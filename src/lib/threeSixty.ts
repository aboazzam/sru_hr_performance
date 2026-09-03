/**
 * Pure logic for the "التقييم الدائري" (360 Review) module -- kept free of
 * Supabase/Next.js so it is directly unit-testable (see threeSixty.test.ts),
 * matching this project's convention of extracting shared business rules
 * (e.g. `recruitmentPlan.ts`, `vacancyStatus.ts`, `orgStructurePositions.ts`)
 * rather than inlining them once inside a Server Component/Action.
 */

export type ThreeSixtyCycleStatus = "draft" | "active" | "closed";
export const threeSixtyCycleStatusLabels: Record<ThreeSixtyCycleStatus, string> = {
  draft: "مسودة",
  active: "نشطة",
  closed: "مغلقة",
};

export type ThreeSixtyAssignmentStatus = "pending" | "submitted" | "excluded";
export const threeSixtyAssignmentStatusLabels: Record<ThreeSixtyAssignmentStatus, string> = {
  pending: "بانتظار التعبئة",
  submitted: "تم التعبئة",
  excluded: "مستبعد",
};

export type ThreeSixtyNominationStatus = "draft" | "submitted" | "approved" | "returned";
export const threeSixtyNominationStatusLabels: Record<ThreeSixtyNominationStatus, string> = {
  draft: "مسودة",
  submitted: "بانتظار اعتماد الرئيس المباشر",
  approved: "معتمدة",
  returned: "أُعيدت لتعديل",
};

export interface ThreeSixtyRaterGroup {
  relationshipCode: string;
  nameAr: string;
  minRatersInGroup: number;
  maxRatersInGroup: number | null;
  shownSeparately: boolean;
  employeeMayNominate: boolean;
}

export interface ThreeSixtyItem {
  id: string;
  itemCode: string;
  competencyId: string;
  itemType: "rating" | "open_text";
  raterGroups: string[];
  required: boolean;
  reverseScored: boolean;
  scaleCode: string | null;
  displayOrder: number;
}

/**
 * Screen 3 ("استبانة تعرض فقط العبارات التي تشمل فئته في rater_groups"):
 * an item is shown to a rater only if their own relationship_code for this
 * assignment appears in that item's `rater_groups` array. Sorted by
 * `display_order` so the questionnaire renders in the intended sequence.
 */
export function itemsForRelationship(items: ThreeSixtyItem[], relationshipCode: string): ThreeSixtyItem[] {
  return items
    .filter((item) => item.raterGroups.includes(relationshipCode))
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export interface NominationCounts {
  /** relationship_code -> number of raters currently nominated in that group. */
  byGroup: Record<string, number>;
}

export interface NominationValidationInput {
  counts: NominationCounts;
  cycle: { minRaters: number; maxRaters: number | null };
  /** Only groups with `employeeMayNominate = true` are checked per-group. */
  raterGroups: ThreeSixtyRaterGroup[];
}

export interface NominationValidationResult {
  ok: boolean;
  /** Arabic-ready, one entry per violation -- see ThreeSixtyNominatePage.errorList. */
  errors: string[];
  totalNominated: number;
}

/**
 * Screen 2 ("ترشيح مقيّميه ضمن حد أدنى وأقصى"): validates a proposed
 * nomination set against both the cycle-wide bound (min_raters/max_raters)
 * and each nominate-able rater group's own bound
 * (min_raters_in_group/max_raters_in_group). Pure so the Server Action and
 * the client-side form can share the exact same rule instead of drifting.
 */
export function validateNominationCounts({
  counts,
  cycle,
  raterGroups,
}: NominationValidationInput): NominationValidationResult {
  const errors: string[] = [];
  const totalNominated = Object.values(counts.byGroup).reduce((sum, n) => sum + n, 0);

  if (totalNominated < cycle.minRaters) {
    errors.push(`العدد الإجمالي للمقيّمين (${totalNominated}) أقل من الحد الأدنى المطلوب (${cycle.minRaters}).`);
  }
  if (cycle.maxRaters != null && totalNominated > cycle.maxRaters) {
    errors.push(`العدد الإجمالي للمقيّمين (${totalNominated}) يتجاوز الحد الأقصى المسموح به (${cycle.maxRaters}).`);
  }

  for (const group of raterGroups) {
    if (!group.employeeMayNominate) continue;
    const count = counts.byGroup[group.relationshipCode] ?? 0;
    if (count < group.minRatersInGroup) {
      errors.push(`عدد "${group.nameAr}" (${count}) أقل من الحد الأدنى لهذه الفئة (${group.minRatersInGroup}).`);
    }
    if (group.maxRatersInGroup != null && count > group.maxRatersInGroup) {
      errors.push(`عدد "${group.nameAr}" (${count}) يتجاوز الحد الأقصى لهذه الفئة (${group.maxRatersInGroup}).`);
    }
  }

  return { ok: errors.length === 0, errors, totalNominated };
}

/**
 * A rating item's raw numeric value, adjusted for reverse-scoring. Reverse
 * scoring mirrors the value around the scale's midpoint
 * (`min + max - value`) so a "reverse scored" item (worded negatively) still
 * contributes in the same direction as every other item once averaged.
 */
export function reverseAdjustedValue(
  value: number,
  scaleMin: number,
  scaleMax: number,
  reverseScored: boolean
): number {
  return reverseScored ? scaleMin + scaleMax - value : value;
}

export interface ScoredResponse {
  competencyId: string;
  numericValue: number;
  reverseScored: boolean;
  scaleMin: number;
  scaleMax: number;
  countedInScore: boolean;
}

/** competencyId -> average adjusted score across every counted response for it. */
export function aggregateCompetencyScores(responses: ScoredResponse[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of responses) {
    if (!r.countedInScore) continue;
    const adjusted = reverseAdjustedValue(r.numericValue, r.scaleMin, r.scaleMax, r.reverseScored);
    const entry = sums.get(r.competencyId) ?? { total: 0, count: 0 };
    entry.total += adjusted;
    entry.count += 1;
    sums.set(r.competencyId, entry);
  }
  const result = new Map<string, number>();
  for (const [competencyId, { total, count }] of sums) {
    if (count > 0) result.set(competencyId, total / count);
  }
  return result;
}

export interface AssignmentForCompletion {
  relationshipCode: string;
  status: "pending" | "submitted" | "excluded";
}

export interface GroupCompletionStat {
  relationshipCode: string;
  total: number;
  submitted: number;
}

/** Per-rater-group submitted/total counts, from a flat assignment list (one cycle, one subject). */
export function groupCompletionStats(assignments: AssignmentForCompletion[]): GroupCompletionStat[] {
  const map = new Map<string, GroupCompletionStat>();
  for (const a of assignments) {
    if (a.status === "excluded") continue;
    const entry = map.get(a.relationshipCode) ?? { relationshipCode: a.relationshipCode, total: 0, submitted: 0 };
    entry.total += 1;
    if (a.status === "submitted") entry.submitted += 1;
    map.set(a.relationshipCode, entry);
  }
  return [...map.values()];
}

/**
 * Screens 4/5 anonymity rule: a rater group's own breakdown is shown
 * separately ONLY when the group is flagged `shown_separately` AND enough
 * raters in it have actually submitted to preserve k-anonymity (at least
 * `min_raters_in_group`) -- otherwise showing "the one peer who rated you"
 * as its own row would de-anonymize that single respondent. Groups that
 * don't clear the bar are folded into the overall aggregate instead of
 * being silently dropped.
 */
export function visibleGroupBreakdown(
  raterGroups: ThreeSixtyRaterGroup[],
  stats: GroupCompletionStat[]
): { visible: GroupCompletionStat[]; folded: GroupCompletionStat[] } {
  const groupByCode = new Map(raterGroups.map((g) => [g.relationshipCode, g]));
  const visible: GroupCompletionStat[] = [];
  const folded: GroupCompletionStat[] = [];
  for (const stat of stats) {
    const group = groupByCode.get(stat.relationshipCode);
    if (group?.shownSeparately && stat.submitted >= group.minRatersInGroup) {
      visible.push(stat);
    } else {
      folded.push(stat);
    }
  }
  return { visible, folded };
}
