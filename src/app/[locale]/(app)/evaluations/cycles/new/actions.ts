"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createEvaluationCycleSchema = z
  .object({
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "end date must be after start date",
  });

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
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
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

  const { nameAr, nameEn, startDate, endDate } = parsed.data;

  const { error } = await supabase.from("evaluation_cycles").insert({
    name_ar: nameAr,
    name_en: nameEn || null,
    start_date: startDate,
    end_date: endDate,
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
