"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmployeeTabActionState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";
    };

function mapError(error: { code?: string; message: string }): EmployeeTabActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

const behavioralLevels = ["basic", "practitioner", "advanced", "professional"] as const;

/**
 * Sets one competency's required level for ONE employee.
 *
 * Deliberately not `job_title_competencies`: that table describes the job
 * title, so writing there would change the requirement for every colleague
 * holding the same title. `employee_competencies` (20260827000003) is the
 * per-person decision the manager is actually making here.
 *
 * A row already present is updated rather than rejected, so re-picking a
 * level reads as a correction instead of a duplicate error.
 */
export async function setEmployeeCompetencyLevel(
  employeeId: string,
  competencyId: string,
  level: string
): Promise<EmployeeTabActionState> {
  const parsed = z
    .object({
      employeeId: z.string().uuid(),
      competencyId: z.string().uuid(),
      level: z.enum(behavioralLevels),
    })
    .safeParse({ employeeId, competencyId, level });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: existing } = await supabase
    .from("employee_competencies")
    .select("id")
    .eq("employee_id", parsed.data.employeeId)
    .eq("competency_id", parsed.data.competencyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("employee_competencies")
      .update({ required_level: parsed.data.level })
      .eq("id", existing.id)
      .select("id");
    if (error) return mapError(error);
    if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };
  } else {
    const { error } = await supabase.from("employee_competencies").insert({
      employee_id: parsed.data.employeeId,
      competency_id: parsed.data.competencyId,
      required_level: parsed.data.level,
      created_by: user.id,
    });
    if (error) return mapError(error);
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "employee_competency_set",
    entity: "employee_competencies",
    entity_id: parsed.data.employeeId,
    after_data: { competency_id: parsed.data.competencyId, required_level: parsed.data.level },
  });

  return { status: "success" };
}

/** Soft-delete: the table has no DELETE policy, per CLAUDE.md §5-A rule 7. */
export async function removeEmployeeCompetency(rowId: string): Promise<EmployeeTabActionState> {
  const parsed = z.string().uuid().safeParse(rowId);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: updated, error } = await supabase
    .from("employee_competencies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .select("id, employee_id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "employee_competency_removed",
    entity: "employee_competencies",
    entity_id: updated[0].employee_id,
    before_data: { id: parsed.data },
  });

  return { status: "success" };
}

/**
 * Nominates one evaluator for an employee's 360 feedback in one cycle.
 *
 * `feedback_360` itself cannot hold this: its INSERT policy requires
 * `evaluator_id` to be the caller, deliberately, so nobody can file feedback
 * in someone else's name — which also means a manager cannot pre-create the
 * rows. The nomination is therefore its own record that precedes the
 * feedback rather than replacing it (20260827000003).
 */
export async function nominateFeedback360Evaluator(input: {
  cycleId: string;
  targetEmployeeId: string;
  evaluatorId: string;
  relation: string;
}): Promise<EmployeeTabActionState> {
  const parsed = z
    .object({
      cycleId: z.string().uuid(),
      targetEmployeeId: z.string().uuid(),
      evaluatorId: z.string().uuid(),
      relation: z.enum(["self", "supervisor", "peer", "customer"]),
    })
    .refine((data) => data.relation === "self" || data.evaluatorId !== data.targetEmployeeId, {
      message: "an evaluator other than self cannot be the employee",
    })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.from("feedback_360_nominations").insert({
    cycle_id: parsed.data.cycleId,
    target_employee_id: parsed.data.targetEmployeeId,
    evaluator_id: parsed.data.evaluatorId,
    evaluator_relation: parsed.data.relation,
    created_by: user.id,
  });
  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "feedback_360_evaluator_nominated",
    entity: "feedback_360_nominations",
    entity_id: parsed.data.targetEmployeeId,
    after_data: {
      cycle_id: parsed.data.cycleId,
      evaluator_id: parsed.data.evaluatorId,
      relation: parsed.data.relation,
    },
  });

  return { status: "success" };
}

export async function removeFeedback360Nomination(rowId: string): Promise<EmployeeTabActionState> {
  const parsed = z.string().uuid().safeParse(rowId);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: updated, error } = await supabase
    .from("feedback_360_nominations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .select("id, target_employee_id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "feedback_360_nomination_removed",
    entity: "feedback_360_nominations",
    entity_id: updated[0].target_employee_id,
    before_data: { id: parsed.data },
  });

  return { status: "success" };
}
