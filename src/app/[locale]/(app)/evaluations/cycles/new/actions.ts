"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidWeights } from "@/lib/evaluationCycle";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const cycleTypes = ["academic", "calendar", "fiscal"] as const;
export type EvaluationCycleType = (typeof cycleTypes)[number];

const createEvaluationCycleSchema = z
  .object({
    cycleType: z.enum(cycleTypes),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    weightGoals: z.coerce.number().min(0).max(100),
    weightCompetencies: z.coerce.number().min(0).max(100),
    weightBau: z.coerce.number().min(0).max(100),
    weightFeedback360: z.coerce.number().min(0).max(100),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "end date must be after start date",
  })
  // The distribution is decided when the cycle is created, not afterwards —
  // it governs every evaluation in the cycle, so a cycle should never exist
  // without one that its own DB CHECK would accept.
  .refine(
    (data) =>
      isValidWeights({
        goals: data.weightGoals,
        competencies: data.weightCompetencies,
        bau: data.weightBau,
        feedback360: data.weightFeedback360,
      }),
    { message: "weights must total 100" }
  );

export type CreateEvaluationCycleState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates an `evaluation_cycles` row through the caller's own
 * RLS-respecting client -- `evaluation_cycles_insert` requires
 * check_vpra_global('evaluation','approve') (20260719000011), hr_admin-only
 * per the seeded matrix, enforced by Postgres itself. This screen never
 * existed before (evaluation_cycles was always a schema/read-only-list
 * feature per the project's own history) -- found live: production has
 * zero cycles, which silently blocks every dependent module (goals, BAU
 * tasks, evaluations, and the strategic-goal cascade), with no way to
 * create the first one anywhere in the app.
 */
export async function createEvaluationCycle(
  locale: Locale,
  _prevState: CreateEvaluationCycleState,
  formData: FormData
): Promise<CreateEvaluationCycleState> {
  const parsed = createEvaluationCycleSchema.safeParse({
    cycleType: formData.get("cycleType"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    weightGoals: formData.get("weightGoals"),
    weightCompetencies: formData.get("weightCompetencies"),
    weightBau: formData.get("weightBau"),
    weightFeedback360: formData.get("weightFeedback360"),
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

  const { cycleType, nameAr, nameEn, startDate, endDate } = parsed.data;

  const { error } = await supabase.from("evaluation_cycles").insert({
    cycle_type: cycleType,
    name_ar: nameAr,
    name_en: nameEn || null,
    start_date: startDate,
    end_date: endDate,
    weight_goals: parsed.data.weightGoals,
    weight_competencies: parsed.data.weightCompetencies,
    weight_bau: parsed.data.weightBau,
    weight_feedback_360: parsed.data.weightFeedback360,
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

  redirect({ href: "/evaluations", locale });
  return null;
}
