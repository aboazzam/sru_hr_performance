"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateNominationCounts, type ThreeSixtyRaterGroup } from "@/lib/threeSixty";

const schema = z.object({
  cycleId: z.string().uuid(),
  // relationshipCode -> array of nominated rater profile ids, as JSON.
  selections: z.string(),
  // rater profile id -> months worked together (number) or null/omitted if
  // not entered, as JSON. Captured here (not on the resulting assignment
  // directly) because the NOMINATING employee is the one who knows this,
  // per this project's `months_worked_together` design decision.
  monthsByRaterId: z.string().optional(),
});

export type SubmitNominationsState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "locked"; errors?: string[] }
  | null;

/**
 * Screen 2: replaces the employee's own nomination set for this cycle with
 * the submitted selection, validates it against the cycle's/rater-groups'
 * min/max bounds, and flips every surviving row to 'submitted' in one step
 * -- ready for the direct supervisor's approval (screen 2's second half,
 * `approveThreeSixtyNominations`). Blocked once any of this employee's
 * rows for the cycle has already reached 'submitted'/'approved' (must be
 * returned by the supervisor first) so a resubmission can't quietly
 * overwrite something already in review or already turned into real
 * assignments.
 */
export async function submitThreeSixtyNominations(
  _prevState: SubmitNominationsState,
  formData: FormData
): Promise<SubmitNominationsState> {
  const parsed = schema.safeParse({
    cycleId: formData.get("cycleId"),
    selections: formData.get("selections"),
    monthsByRaterId: formData.get("monthsByRaterId") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  let selections: Record<string, string[]>;
  let monthsByRaterId: Record<string, number | null> = {};
  try {
    selections = JSON.parse(parsed.data.selections);
    if (parsed.data.monthsByRaterId) monthsByRaterId = JSON.parse(parsed.data.monthsByRaterId);
  } catch {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!myProfile) return { status: "error", message: "forbidden" };

  const { cycleId } = parsed.data;

  const [{ data: cycle }, { data: raterGroupRows }, { data: existingRows }] = await Promise.all([
    supabase.from("three_sixty_cycles").select("min_raters, max_raters").eq("id", cycleId).maybeSingle(),
    supabase
      .from("three_sixty_rater_groups")
      .select("relationship_code, name_ar, min_raters_in_group, max_raters_in_group, employee_may_nominate, shown_separately, group_weight_pct")
      .is("deleted_at", null),
    supabase
      .from("three_sixty_nominations")
      .select("id, relationship_code, rater_employee_id, status")
      .eq("cycle_id", cycleId)
      .eq("subject_employee_id", myProfile.id)
      .is("deleted_at", null),
  ]);

  if (!cycle) return { status: "error", message: "invalid_input" };

  if ((existingRows ?? []).some((r) => r.status === "submitted" || r.status === "approved")) {
    return { status: "error", message: "locked" };
  }

  const raterGroups: ThreeSixtyRaterGroup[] = (raterGroupRows ?? []).map((g) => ({
    relationshipCode: g.relationship_code,
    nameAr: g.name_ar,
    groupWeightPct: g.group_weight_pct,
    minRatersInGroup: g.min_raters_in_group,
    maxRatersInGroup: g.max_raters_in_group,
    shownSeparately: g.shown_separately,
    employeeMayNominate: g.employee_may_nominate,
  }));
  const nominateableCodes = new Set(raterGroups.filter((g) => g.employeeMayNominate).map((g) => g.relationshipCode));

  const byGroup: Record<string, number> = {};
  const desired = new Map<string, Set<string>>(); // relationshipCode -> set of rater ids
  for (const [code, raterIds] of Object.entries(selections)) {
    if (!nominateableCodes.has(code)) continue; // ignore anything for a non-nominate-able group
    const unique = [...new Set(raterIds)].filter((id) => id !== myProfile.id);
    if (unique.length === 0) continue;
    byGroup[code] = unique.length;
    desired.set(code, new Set(unique));
  }

  const validation = validateNominationCounts({
    counts: { byGroup },
    cycle: { minRaters: cycle.min_raters, maxRaters: cycle.max_raters },
    raterGroups,
  });
  if (!validation.ok) {
    return { status: "error", message: "invalid_input", errors: validation.errors };
  }

  // Soft-delete rows no longer selected, keep rows still selected, insert new ones.
  const existingByKey = new Map((existingRows ?? []).map((r) => [`${r.relationship_code}::${r.rater_employee_id}`, r]));
  const desiredKeys = new Set<string>();
  for (const [code, raterIds] of desired) {
    for (const raterId of raterIds) desiredKeys.add(`${code}::${raterId}`);
  }

  const toRemoveIds = (existingRows ?? []).filter((r) => !desiredKeys.has(`${r.relationship_code}::${r.rater_employee_id}`)).map((r) => r.id);
  const toInsert: {
    cycle_id: string;
    subject_employee_id: string;
    rater_employee_id: string;
    relationship_code: string;
    status: string;
    months_worked_together: number | null;
  }[] = [];
  for (const key of desiredKeys) {
    if (!existingByKey.has(key)) {
      const [relationshipCode, raterEmployeeId] = key.split("::");
      toInsert.push({
        cycle_id: cycleId,
        subject_employee_id: myProfile.id,
        rater_employee_id: raterEmployeeId,
        relationship_code: relationshipCode,
        status: "submitted",
        months_worked_together: monthsByRaterId[raterEmployeeId] ?? null,
      });
    }
  }
  const toKeep = (existingRows ?? []).filter((r) => desiredKeys.has(`${r.relationship_code}::${r.rater_employee_id}`));

  if (toRemoveIds.length > 0) {
    const { error } = await supabase
      .from("three_sixty_nominations")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", toRemoveIds);
    if (error) return { status: "error", message: "forbidden" };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("three_sixty_nominations").insert(toInsert);
    if (error) return { status: "error", message: "forbidden" };
  }
  for (const row of toKeep) {
    const { error } = await supabase
      .from("three_sixty_nominations")
      .update({ status: "submitted", months_worked_together: monthsByRaterId[row.rater_employee_id] ?? null })
      .eq("id", row.id);
    if (error) return { status: "error", message: "forbidden" };
  }

  return { status: "success" };
}
