"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const assignGoalSchema = z
  .object({
    employeeId: z.string().uuid(),
    cycleId: z.string().uuid(),
    goalLibraryId: z.string().uuid().optional(),
    customTitleAr: z.string().trim().min(1).optional(),
    weight: z.coerce.number().min(0.01).max(100).optional(),
    targetAr: z.string().trim().optional(),
  })
  .refine((data) => Boolean(data.goalLibraryId) !== Boolean(data.customTitleAr), {
    message: "exactly one of goalLibraryId or customTitleAr is required",
  });

export type AssignGoalState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `goals` row for an employee (CLAUDE.md §6 "goals — assigned
 * goals"), through the caller's own RLS-respecting client — `goals`' RLS
 * (20260718000003) requires `check_vpra('goalAssignment','prepare',
 * orgUnitId)` for INSERT with NO self-row bypass, so this only ever
 * succeeds for a real supervisor/manager (or higher), never a plain
 * employee assigning themselves a goal — enforced by Postgres itself, not
 * this action's code.
 */
export async function assignGoal(
  _prevState: AssignGoalState,
  formData: FormData
): Promise<AssignGoalState> {
  const parsed = assignGoalSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
    goalLibraryId: formData.get("goalLibraryId") || undefined,
    customTitleAr: formData.get("customTitleAr") || undefined,
    weight: formData.get("weight") || undefined,
    targetAr: formData.get("targetAr") || undefined,
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

  const { employeeId, cycleId, goalLibraryId, customTitleAr, weight, targetAr } = parsed.data;

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      employee_id: employeeId,
      cycle_id: cycleId,
      goal_library_id: goalLibraryId ?? null,
      custom_title_ar: customTitleAr ?? null,
      weight: weight ?? null,
      target_ar: targetAr || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "goal_assigned",
    entity: "goals",
    entity_id: goal.id,
    after_data: {
      employee_id: employeeId,
      cycle_id: cycleId,
      goal_library_id: goalLibraryId ?? null,
      custom_title_ar: customTitleAr ?? null,
      weight: weight ?? null,
    },
  });

  return { status: "success" };
}
