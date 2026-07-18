"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const assignSupervisorSchema = z
  .object({
    employeeId: z.string().uuid(),
    supervisorId: z.string().uuid(),
  })
  .refine((data) => data.employeeId !== data.supervisorId, {
    message: "employee cannot be their own supervisor",
  });

export type AssignSupervisorState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Sets `profiles.supervisor_id` (20260718000008) for an employee, through
 * the caller's own RLS-respecting client — `profiles_update` requires
 * `check_vpra('employeeData','prepare', org_unit_id)`, which only
 * `hr_admin` reaches today (the sole role at 'approve', clearing
 * 'prepare') per the seeded matrix — same authorization level as the
 * existing employee-invite flow. The self-supervision CHECK
 * (`profiles_supervisor_not_self`) is validated in Zod too, not just
 * relied on at the DB layer.
 */
export async function assignSupervisor(
  _prevState: AssignSupervisorState,
  formData: FormData
): Promise<AssignSupervisorState> {
  const parsed = assignSupervisorSchema.safeParse({
    employeeId: formData.get("employeeId"),
    supervisorId: formData.get("supervisorId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { employeeId, supervisorId } = parsed.data;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ supervisor_id: supervisorId })
    .eq("id", employeeId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  // A 0-row update (blocked by RLS, or the employee doesn't exist) looks
  // like "forbidden" here — same generic-blocked-vs-missing convention
  // already used across this project.
  if (!updated) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "supervisor_assigned",
    entity: "profiles",
    entity_id: employeeId,
    after_data: { supervisor_id: supervisorId },
  });

  return { status: "success" };
}
