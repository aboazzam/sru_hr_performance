"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaveSupervisorAssignmentsState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

const supervisorFieldSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v))
  .pipe(z.string().uuid().nullable());

/**
 * Manages `profiles.supervisor_id` (20260718000008) for every employee in
 * one screen, replacing the earlier one-employee-at-a-time "assign"
 * form -- that form had no visibility into existing assignments and
 * couldn't clear one. The set of employees is re-derived here from
 * `profiles` itself, never trusted from the client, and only matched
 * against form fields named `supervisor_<id>` for each id it just
 * fetched, same discipline as `saveEvaluationScores`/
 * `saveCalibrationResults`.
 *
 * Each write goes through the caller's own RLS-respecting client --
 * `profiles_update`'s `check_vpra('employeeData','prepare', org_unit_id)`
 * is the real authorization boundary, `hr_admin`-only per the seeded
 * matrix, same level the original single-employee form required. Only
 * employees whose assignment actually changed are written, to avoid a
 * flood of no-op UPDATEs and a noisy audit trail. An empty selection
 * clears the assignment (`supervisor_id = NULL`); the
 * `profiles_supervisor_not_self` CHECK is the final backstop against
 * self-supervision (already screened out client-side by excluding each
 * row's own id from its own options).
 */
export async function saveSupervisorAssignments(
  _prevState: SaveSupervisorAssignmentsState,
  formData: FormData
): Promise<SaveSupervisorAssignmentsState> {
  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: employees } = await supabase
    .from("profiles")
    .select("id, supervisor_id")
    .is("deleted_at", null);

  type Change = { employeeId: string; before: string | null; after: string | null };
  const changes: Change[] = [];

  for (const employee of employees ?? []) {
    const parsed = supervisorFieldSchema.safeParse(
      formData.get(`supervisor_${employee.id}`)?.toString()
    );
    if (!parsed.success) {
      return { status: "error", message: "invalid_input" };
    }
    if (parsed.data !== employee.supervisor_id) {
      changes.push({ employeeId: employee.id, before: employee.supervisor_id, after: parsed.data });
    }
  }

  const admin = createAdminClient();

  for (const change of changes) {
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ supervisor_id: change.after })
      .eq("id", change.employeeId)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "23514") {
        return { status: "error", message: "invalid_input" };
      }
      return { status: "error", message: "unknown" };
    }

    if (!updated) {
      return { status: "error", message: "forbidden" };
    }

    await admin.from("audit_log").insert({
      actor_id: actor.id,
      action: "supervisor_assigned",
      entity: "profiles",
      entity_id: change.employeeId,
      before_data: { supervisor_id: change.before },
      after_data: { supervisor_id: change.after },
    });
  }

  return { status: "success" };
}
