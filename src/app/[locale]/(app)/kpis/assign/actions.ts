"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const assignTargetSchema = z
  .object({
    subGoalId: z.string().uuid().optional(),
    parentTargetId: z.string().uuid().optional(),
    // Which KPI this cascaded figure serves, and for which year. Required
    // (2026-07-30): a target that doesn't state its indicator or its cycle
    // can't be rolled up or evaluated -- "مستهدف سنوي وعليه يتم التقييم".
    kpiId: z.string().uuid(),
    cycleId: z.string().uuid(),
    titleAr: z.string().trim().min(1),
    titleEn: z.string().trim().optional(),
    targetValue: z.coerce.number(),
    unitAr: z.string().trim().min(1),
    unitEn: z.string().trim().optional(),
    weight: z.coerce.number().min(0.01).max(100).optional(),
    positionId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.subGoalId) !== Boolean(data.parentTargetId), {
    message: "exactly one parent context (subGoalId or parentTargetId) is required",
  })
  .refine((data) => Boolean(data.positionId) !== Boolean(data.employeeId), {
    message: "exactly one recipient (position or employee) is required",
  });

export type AssignTargetState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `targets` row -- cascading a sub_goal (or another target)
 * further down, per "مدير الاستارتيجية يسقط للمدراء وهم من يسقطونها لمن
 * دونهم سواء ادارات او اقسام او موظفين". Through the caller's own
 * RLS-respecting client -- `targets_insert` (20260727000005) requires
 * being the current owner of the immediate parent (is_my_strategic_position
 * on the parent sub_goal's owner_position_id or the parent target's
 * assigned_position_id), enforced by Postgres itself -- seeing this form
 * doesn't guarantee the insert succeeds, same convention as every other
 * assign screen in this app.
 */
export async function assignTarget(locale: Locale, _prevState: AssignTargetState, formData: FormData): Promise<AssignTargetState> {
  const parsed = assignTargetSchema.safeParse({
    subGoalId: formData.get("subGoalId") || undefined,
    parentTargetId: formData.get("parentTargetId") || undefined,
    kpiId: formData.get("kpiId"),
    cycleId: formData.get("cycleId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn") || undefined,
    targetValue: formData.get("targetValue"),
    unitAr: formData.get("unitAr"),
    unitEn: formData.get("unitEn") || undefined,
    weight: formData.get("weight") || undefined,
    positionId: formData.get("positionId") || undefined,
    employeeId: formData.get("employeeId") || undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "unauthenticated" };
  }

  const { subGoalId, parentTargetId, kpiId, cycleId, titleAr, titleEn, targetValue, unitAr, unitEn, weight, positionId, employeeId } =
    parsed.data;

  // sub_goal_id is required on every row (a target always ultimately
  // belongs to one sub_goal, even several hops down) -- when cascading
  // from an existing target, inherit its sub_goal_id rather than asking
  // the form for it again.
  let resolvedSubGoalId = subGoalId ?? null;
  if (!resolvedSubGoalId && parentTargetId) {
    const { data: parent } = await supabase.from("targets").select("sub_goal_id").eq("id", parentTargetId).maybeSingle();
    resolvedSubGoalId = parent?.sub_goal_id ?? null;
  }
  if (!resolvedSubGoalId) {
    return { status: "error", message: "invalid_input" };
  }

  // Self-row lookup (profiles_select always allows this regardless of
  // VPRA) — created_by references profiles(id), not auth.users(id).
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { error } = await supabase.from("targets").insert({
    sub_goal_id: resolvedSubGoalId,
    kpi_id: kpiId,
    cycle_id: cycleId,
    parent_target_id: parentTargetId ?? null,
    assigned_position_id: positionId ?? null,
    assigned_employee_id: employeeId ?? null,
    created_by: myProfile?.id ?? null,
    title_ar: titleAr,
    title_en: titleEn || null,
    target_value: targetValue,
    unit_ar: unitAr,
    unit_en: unitEn || null,
    weight: weight ?? null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: "/kpis", locale });
  return null;
}
