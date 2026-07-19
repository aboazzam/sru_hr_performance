"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";
import { evalTypes } from "@/lib/vpra";

const createEvaluationSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid(),
  evalType: z.enum(evalTypes as [string, ...string[]]),
});

export type CreateEvaluationState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";
    }
  | null;

/**
 * Creates an `evaluations` row (state defaults to 'draft') through the
 * caller's own RLS-respecting client — `evaluations_insert` is self-row,
 * OR `check_vpra('evaluation','approve', orgUnitId)` (hr_admin, the sole
 * 'approve'-level role), OR `is_my_direct_report()` (20260718000010) for
 * a real supervisor creating one for their direct report; every other
 * role gets "forbidden."
 *
 * `eval_type` (20260718000012) — self/supervisor/peer/customer — means
 * `evaluations` now allows MULTIPLE rows per employee per cycle, one per
 * perspective (UNIQUE is (employee_id, cycle_id, eval_type), not just
 * (employee_id, cycle_id) anymore), so "duplicate" here specifically means
 * this employee already has an evaluation of this exact eval_type in this
 * cycle — a different eval_type for the same employee/cycle is fine.
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
    evalType: formData.get("evalType"),
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

  const { employeeId, cycleId, evalType } = parsed.data;

  const { data: evaluation, error } = await supabase
    .from("evaluations")
    .insert({ employee_id: employeeId, cycle_id: cycleId, eval_type: evalType })
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
