"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const assignBauTaskSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid(),
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().optional(),
  weight: z.coerce.number().min(0.01).max(100).optional(),
});

export type AssignBauTaskState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `bau_tasks` row (CLAUDE.md §6 "bau_tasks — business-as-usual
 * tasks") through the caller's own RLS-respecting client — `bau_tasks`'
 * RLS (20260718000004) is `self-row OR check_vpra('bauTasks','approve',
 * orgUnitId)`, unlike `goals` (which has no self-row bypass at all): an
 * employee genuinely holds 'prepare' on `bauTasks` (their own routine
 * tasks are meant to be self-reported), so this succeeds both for an
 * employee assigning themselves a task AND for a `manager` (the sole
 * 'approve'-level role) assigning one to someone else — but NOT for a
 * plain `employee`/`supervisor`/`field_supervisor` picking a DIFFERENT
 * employee, since their shared flat 'prepare' grant deliberately does not
 * clear the 'approve' bar RLS requires for non-self rows (the exact
 * ambiguity fix from 20260718000004's own migration).
 */
export async function assignBauTask(
  _prevState: AssignBauTaskState,
  formData: FormData
): Promise<AssignBauTaskState> {
  const parsed = assignBauTaskSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn") || undefined,
    weight: formData.get("weight") || undefined,
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

  const { employeeId, cycleId, titleAr, titleEn, weight } = parsed.data;

  const { data: task, error } = await supabase
    .from("bau_tasks")
    .insert({
      employee_id: employeeId,
      cycle_id: cycleId,
      title_ar: titleAr,
      title_en: titleEn ?? null,
      weight: weight ?? null,
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
    action: "bau_task_assigned",
    entity: "bau_tasks",
    entity_id: task.id,
    after_data: {
      employee_id: employeeId,
      cycle_id: cycleId,
      title_ar: titleAr,
      weight: weight ?? null,
    },
  });

  return { status: "success" };
}
