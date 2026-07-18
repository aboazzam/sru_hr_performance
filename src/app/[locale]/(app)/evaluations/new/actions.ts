"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createEvaluationSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid(),
});

export type CreateEvaluationState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";
    }
  | null;

/**
 * Creates an `evaluations` row (state defaults to 'draft') through the
 * caller's own RLS-respecting client — `evaluations`' RLS
 * (20260718000001) is `self-row OR check_vpra('evaluation','approve',
 * orgUnitId)`, so this succeeds for an employee creating their OWN
 * evaluation, or `hr_admin` (the sole 'approve'-level role) creating one
 * for someone else; every other role gets "forbidden," matching the same
 * documented RLS limitation as `transitionEvaluation`.
 *
 * `locale` is bound client-side (`createEvaluation.bind(null, locale)`,
 * same pattern as `login`) so the post-create redirect to the new
 * evaluation's detail page keeps the current locale prefix.
 */
export async function createEvaluation(
  locale: Locale,
  _prevState: CreateEvaluationState,
  formData: FormData
): Promise<CreateEvaluationState> {
  const parsed = createEvaluationSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
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

  const { employeeId, cycleId } = parsed.data;

  const { data: evaluation, error } = await supabase
    .from("evaluations")
    .insert({ employee_id: employeeId, cycle_id: cycleId })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "duplicate" };
    }
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: `/evaluations/${evaluation.id}`, locale });
  return null;
}
