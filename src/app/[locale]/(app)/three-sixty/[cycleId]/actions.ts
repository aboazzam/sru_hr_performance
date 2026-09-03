"use server";

import { createClient } from "@/lib/supabase/server";

export type GenerateFixedAssignmentsState =
  | { status: "success"; created: number }
  | { status: "error"; message: "not_found" | "forbidden" | "unknown" }
  | null;

/**
 * Auto-generates the "system-assigned" relationships (self-assessment and
 * direct-supervisor) for every employee who has at least one nomination in
 * this cycle -- these two relationships are never nominated by the
 * employee themselves (a `three_sixty_rater_groups` row with
 * `employee_may_nominate = false`), so nothing else in this module ever
 * creates them. Idempotent: relies on
 * `three_sixty_assignments_uidx (cycle_id, subject_employee_id,
 * rater_employee_id, relationship_code)` -- a duplicate insert is silently
 * skipped, so this can be re-run safely as more employees submit
 * nominations throughout the cycle.
 */
export async function generateThreeSixtyFixedAssignments(
  _prevState: GenerateFixedAssignmentsState,
  formData: FormData
): Promise<GenerateFixedAssignmentsState> {
  const cycleId = formData.get("cycleId");
  if (typeof cycleId !== "string" || cycleId === "") {
    return { status: "error", message: "not_found" };
  }

  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("three_sixty_cycles")
    .select("id, include_self_assessment")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return { status: "error", message: "not_found" };

  const { data: raterGroups } = await supabase
    .from("three_sixty_rater_groups")
    .select("relationship_code, employee_may_nominate")
    .is("deleted_at", null);
  const selfGroup = (raterGroups ?? []).find((g) => g.relationship_code === "self");
  const supervisorGroup = (raterGroups ?? []).find((g) => g.relationship_code === "supervisor");

  const { data: nominationRows } = await supabase
    .from("three_sixty_nominations")
    .select("subject_employee_id")
    .eq("cycle_id", cycleId)
    .is("deleted_at", null);
  const subjectIds = [...new Set((nominationRows ?? []).map((n) => n.subject_employee_id))];
  if (subjectIds.length === 0) return { status: "success", created: 0 };

  const { data: subjects } = await supabase
    .from("profiles")
    .select("id, supervisor_id")
    .in("id", subjectIds);

  // `three_sixty_assignments_uidx` is a PARTIAL unique index
  // (WHERE deleted_at IS NULL), which PostgREST's upsert onConflict can't
  // target -- the same limitation already hit for evaluation_scores/
  // calibration_results in this project. Select existing rows first and
  // only insert the missing ones, rather than a blind upsert.
  const { data: existingRows } = await supabase
    .from("three_sixty_assignments")
    .select("subject_employee_id, rater_employee_id, relationship_code")
    .eq("cycle_id", cycleId)
    .in("relationship_code", ["self", "supervisor"])
    .is("deleted_at", null);
  const existingKeys = new Set(
    (existingRows ?? []).map((r) => `${r.subject_employee_id}::${r.rater_employee_id}::${r.relationship_code}`)
  );

  const toInsert: { cycle_id: string; subject_employee_id: string; rater_employee_id: string; relationship_code: string }[] = [];
  for (const subject of subjects ?? []) {
    if (selfGroup && cycle.include_self_assessment) {
      const key = `${subject.id}::${subject.id}::self`;
      if (!existingKeys.has(key)) {
        toInsert.push({ cycle_id: cycleId, subject_employee_id: subject.id, rater_employee_id: subject.id, relationship_code: "self" });
      }
    }
    if (supervisorGroup && subject.supervisor_id) {
      const key = `${subject.id}::${subject.supervisor_id}::supervisor`;
      if (!existingKeys.has(key)) {
        toInsert.push({
          cycle_id: cycleId,
          subject_employee_id: subject.id,
          rater_employee_id: subject.supervisor_id,
          relationship_code: "supervisor",
        });
      }
    }
  }

  if (toInsert.length === 0) return { status: "success", created: 0 };

  const { data: inserted, error } = await supabase.from("three_sixty_assignments").insert(toInsert).select("id");

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  return { status: "success", created: inserted?.length ?? 0 };
}

export type ExcludeAssignmentState = { status: "success" } | { status: "error"; message: "forbidden" | "unknown" } | null;

/** HR excludes a rater from a cycle (e.g. left the university mid-cycle). */
export async function excludeThreeSixtyAssignment(
  _prevState: ExcludeAssignmentState,
  formData: FormData
): Promise<ExcludeAssignmentState> {
  const assignmentId = formData.get("assignmentId");
  if (typeof assignmentId !== "string" || assignmentId === "") {
    return { status: "error", message: "unknown" };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("three_sixty_assignments")
    .update({ status: "excluded" }, { count: "exact" })
    .eq("id", assignmentId);

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!count) return { status: "error", message: "forbidden" };
  return { status: "success" };
}
