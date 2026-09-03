"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMissingThreeSixtyAssignments } from "../assignmentCreation";

export type GenerateFixedAssignmentsState =
  | { status: "success"; created: number }
  | { status: "error"; message: "not_found" | "forbidden" | "unknown" }
  | null;

const cycleIdSchema = z.object({ cycleId: z.string().uuid() });

/**
 * Auto-generates the "system-assigned" relationships (self-assessment and
 * direct-supervisor) for every employee who has at least one nomination in
 * this cycle -- these two relationships are never nominated by the
 * employee themselves (a `three_sixty_rater_groups` row with
 * `employee_may_nominate = false`), so nothing else in this module ever
 * creates them. Idempotent (see `createMissingThreeSixtyAssignments`).
 *
 * `supervisor_id` is resolved via `get_profiles_supervisor_ids()`, not a
 * direct `profiles` query -- found during review that `profiles_select`'s
 * RLS has no branch for "holds threeSixty prepare/approve," so an HR user
 * whose role has only `threeSixty` (no `employeeData` grant) would
 * otherwise get a silently partial/empty result and undercount created
 * assignments with no error (20260902000007's migration header).
 */
export async function generateThreeSixtyFixedAssignments(
  _prevState: GenerateFixedAssignmentsState,
  formData: FormData
): Promise<GenerateFixedAssignmentsState> {
  const parsed = cycleIdSchema.safeParse({ cycleId: formData.get("cycleId") });
  if (!parsed.success) return { status: "error", message: "not_found" };
  const { cycleId } = parsed.data;

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

  const { data: subjects, error: subjectsError } = await supabase.rpc("get_profiles_supervisor_ids", {
    p_ids: subjectIds,
  });
  if (subjectsError) return { status: "error", message: "unknown" };

  const candidates: { subjectEmployeeId: string; raterEmployeeId: string; relationshipCode: string }[] = [];
  for (const subject of subjects ?? []) {
    if (selfGroup && cycle.include_self_assessment) {
      candidates.push({ subjectEmployeeId: subject.id, raterEmployeeId: subject.id, relationshipCode: "self" });
    }
    if (supervisorGroup && subject.supervisor_id) {
      candidates.push({
        subjectEmployeeId: subject.id,
        raterEmployeeId: subject.supervisor_id,
        relationshipCode: "supervisor",
      });
    }
  }

  const { created, error } = await createMissingThreeSixtyAssignments(supabase, cycleId, candidates);
  if (error) {
    return {
      status: "error",
      message: error.includes("row-level security") ? "forbidden" : "unknown",
    };
  }

  return { status: "success", created };
}

export type ExcludeAssignmentState = { status: "success" } | { status: "error"; message: "forbidden" | "unknown" } | null;

const assignmentIdSchema = z.object({ assignmentId: z.string().uuid() });

/**
 * HR excludes a rater from a cycle (e.g. left the university mid-cycle).
 * Writes an `audit_log` entry (CLAUDE.md 5-A rule 6) -- found missing
 * across this whole module during review.
 */
export async function excludeThreeSixtyAssignment(
  _prevState: ExcludeAssignmentState,
  formData: FormData
): Promise<ExcludeAssignmentState> {
  const parsed = assignmentIdSchema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return { status: "error", message: "unknown" };
  const { assignmentId } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: before } = await supabase
    .from("three_sixty_assignments")
    .select("status, cycle_id, subject_employee_id, rater_employee_id")
    .eq("id", assignmentId)
    .maybeSingle();

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

  if (user) {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "three_sixty_assignment_excluded",
      entity: "three_sixty_assignments",
      entity_id: assignmentId,
      before_data: before ?? null,
      after_data: { status: "excluded" },
    });
  }

  return { status: "success" };
}
