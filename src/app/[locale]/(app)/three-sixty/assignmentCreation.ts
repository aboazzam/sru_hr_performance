import type { SupabaseClient } from "@supabase/supabase-js";

export interface AssignmentCandidate {
  subjectEmployeeId: string;
  raterEmployeeId: string;
  relationshipCode: string;
}

/**
 * Shared "create the missing three_sixty_assignments rows for a cycle"
 * step, used by both `generateThreeSixtyFixedAssignments`
 * ([cycleId]/actions.ts, self/supervisor auto-assignment) and
 * `reviewThreeSixtyNominations` (approvals/actions.ts, nomination
 * approval) -- found duplicated verbatim (two different dedupe-key shapes
 * for the identical select-existing/filter/insert-missing algorithm)
 * during this module's own code review, extracted here so a future fix
 * (a race condition, an audit_log write, a new dedupe field) only needs to
 * land once.
 *
 * `three_sixty_assignments_uidx` is a PARTIAL unique index
 * (WHERE deleted_at IS NULL), which PostgREST's upsert onConflict can't
 * target -- the established select-then-insert-missing workaround, not a
 * blind upsert.
 */
export async function createMissingThreeSixtyAssignments(
  supabase: SupabaseClient,
  cycleId: string,
  candidates: AssignmentCandidate[]
): Promise<{ created: number; error: string | null }> {
  if (candidates.length === 0) return { created: 0, error: null };

  const relationshipCodes = [...new Set(candidates.map((c) => c.relationshipCode))];
  const { data: existingRows, error: fetchError } = await supabase
    .from("three_sixty_assignments")
    .select("subject_employee_id, rater_employee_id, relationship_code")
    .eq("cycle_id", cycleId)
    .in("relationship_code", relationshipCodes)
    .is("deleted_at", null);
  if (fetchError) return { created: 0, error: fetchError.message };

  const existingKeys = new Set(
    (existingRows ?? []).map((r) => `${r.subject_employee_id}::${r.rater_employee_id}::${r.relationship_code}`)
  );

  const seen = new Set<string>();
  const toInsert = candidates.filter((c) => {
    const key = `${c.subjectEmployeeId}::${c.raterEmployeeId}::${c.relationshipCode}`;
    if (existingKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (toInsert.length === 0) return { created: 0, error: null };

  const { data: inserted, error: insertError } = await supabase
    .from("three_sixty_assignments")
    .insert(
      toInsert.map((c) => ({
        cycle_id: cycleId,
        subject_employee_id: c.subjectEmployeeId,
        rater_employee_id: c.raterEmployeeId,
        relationship_code: c.relationshipCode,
      }))
    )
    .select("id");
  if (insertError) return { created: 0, error: insertError.message };

  return { created: inserted?.length ?? 0, error: null };
}
