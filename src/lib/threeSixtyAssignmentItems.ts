import type { SupabaseClient } from "@supabase/supabase-js";
import {
  itemsForRelationship,
  itemsForSubjectLevel,
  resolveThreeSixtyItemLevels,
  type BehavioralLevel,
  type ThreeSixtyCompetencyScope,
  type ThreeSixtyItem,
} from "@/lib/threeSixty";

/**
 * Resolves which 360 items actually apply to one assignment (its subject's
 * job-title levels + its own relationship_code) -- the exact same filtering
 * the survey page renders. Shared so "what's required at submission time"
 * can never drift from "what was actually shown to answer" -- which is
 * precisely the bug this closes: before this, `submitThreeSixtyAssignment`
 * checked ALL required items matching the rater group (~216, ignoring
 * behavioral level and competency applicability), not the ~22 the subject's
 * job title actually resolves to (see migration 20260904000003's level
 * split and 20260905000001's specialized-competency scoping). Since that
 * split shipped, a real rater's "missing required items" count could never
 * reach zero, silently blocking every submission.
 *
 * `levelRows` must already be resolved by the caller, because the two real
 * callers need different privilege-bypass mechanisms: an authenticated
 * rater's own client has no RLS path to `job_title_competencies` (hence the
 * `get_three_sixty_subject_levels` SECURITY DEFINER RPC), while the
 * external-rater flow's service-role client already bypasses RLS entirely
 * and can query `job_title_competencies` directly -- reusing the RPC there
 * would return nothing, since its own internal check requires a real
 * `auth.uid()` that a token-based, unauthenticated request never has.
 */
export async function resolveApplicableThreeSixtyItems(
  supabase: SupabaseClient,
  relationshipCode: string,
  levelRows: { competencyId: string; requiredLevel: BehavioralLevel }[]
): Promise<ThreeSixtyItem[]> {
  const [{ data: itemRows }, { data: competencyRows }] = await Promise.all([
    supabase
      .from("three_sixty_items")
      .select(
        "id, item_code, competency_id, item_type, text_ar, rater_groups, required, reverse_scored, scale_code, display_order, behavioral_level"
      )
      .is("deleted_at", null),
    supabase.from("three_sixty_competencies").select("id, source_competency_id, applies_to").is("deleted_at", null),
  ]);

  const items: ThreeSixtyItem[] = (itemRows ?? []).map((i) => ({
    id: i.id,
    itemCode: i.item_code,
    competencyId: i.competency_id,
    itemType: i.item_type,
    raterGroups: i.rater_groups as string[],
    required: i.required,
    reverseScored: i.reverse_scored,
    scaleCode: i.scale_code,
    displayOrder: i.display_order,
    behavioralLevel: i.behavioral_level as BehavioralLevel | null,
  }));

  const resolvedLevels = resolveThreeSixtyItemLevels(
    (competencyRows ?? []).map((c) => ({
      id: c.id,
      sourceCompetencyId: c.source_competency_id,
      appliesTo: (c.applies_to as ThreeSixtyCompetencyScope | null) ?? "all",
    })),
    levelRows
  );

  return itemsForRelationship(itemsForSubjectLevel(items, resolvedLevels), relationshipCode);
}
