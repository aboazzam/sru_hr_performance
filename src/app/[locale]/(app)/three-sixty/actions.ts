"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createCycleSchema = z
  .object({
    cycleCode: z.string().trim().min(1).max(60),
    nameAr: z.string().trim().min(1).max(200),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    minRaters: z.coerce.number().int().min(1),
    maxRaters: z.coerce.number().int().min(1).optional(),
    minMonthsTogether: z.coerce.number().int().min(0),
    includeSelfAssessment: z.coerce.boolean(),
    showManagerSeparately: z.coerce.boolean(),
    anonymityMode: z.enum(["anonymous", "identified"]),
    weightInTotalScore: z.coerce.number().min(0).max(100).optional(),
    purpose: z.string().trim().max(2000).optional(),
    scaleCode: z.string().trim().min(1).max(60),
  })
  .refine((data) => data.endDate >= data.startDate, { message: "end before start" })
  .refine((data) => data.maxRaters === undefined || data.maxRaters >= data.minRaters, {
    message: "max below min",
  });

export type CreateThreeSixtyCycleState =
  | { status: "success"; cycleId: string }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown_scale" | "unknown";
    }
  | null;

/**
 * Screen 1 ("إنشاء دورة"). `owner_id` -- the person who alone (besides an
 * `approve`-level HR user) can see row-level who-submitted/who-hasn't
 * detail on this cycle -- always defaults to the caller's own profile,
 * never taken from the client; reassigning ownership isn't asked for here.
 * `scale_code` existence is enforced by the DB trigger
 * (`validate_three_sixty_cycle_scale`), not re-checked here -- a bogus code
 * surfaces as a clear `unknown_scale` error rather than a generic one.
 */
export async function createThreeSixtyCycle(
  _prevState: CreateThreeSixtyCycleState,
  formData: FormData
): Promise<CreateThreeSixtyCycleState> {
  const parsed = createCycleSchema.safeParse({
    cycleCode: formData.get("cycleCode"),
    nameAr: formData.get("nameAr"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    minRaters: formData.get("minRaters"),
    maxRaters: formData.get("maxRaters") || undefined,
    minMonthsTogether: formData.get("minMonthsTogether") || "0",
    includeSelfAssessment: formData.get("includeSelfAssessment") === "on",
    showManagerSeparately: formData.get("showManagerSeparately") === "on",
    anonymityMode: formData.get("anonymityMode"),
    weightInTotalScore: formData.get("weightInTotalScore") || undefined,
    purpose: formData.get("purpose") || undefined,
    scaleCode: formData.get("scaleCode"),
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
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!myProfile) {
    return { status: "error", message: "forbidden" };
  }

  const d = parsed.data;
  const { data: inserted, error } = await supabase
    .from("three_sixty_cycles")
    .insert({
      cycle_code: d.cycleCode,
      name_ar: d.nameAr,
      start_date: d.startDate,
      end_date: d.endDate,
      min_raters: d.minRaters,
      max_raters: d.maxRaters ?? null,
      min_months_together: d.minMonthsTogether,
      include_self_assessment: d.includeSelfAssessment,
      show_manager_separately: d.showManagerSeparately,
      anonymity_mode: d.anonymityMode,
      weight_in_total_score: d.weightInTotalScore ?? null,
      purpose: d.purpose ?? null,
      scale_code: d.scaleCode,
      owner_id: myProfile.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { status: "error", message: "duplicate" };
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.message.includes("unknown scale_code")) return { status: "error", message: "unknown_scale" };
    if (error.code === "23514") return { status: "error", message: "invalid_input" };
    return { status: "error", message: "unknown" };
  }

  return { status: "success", cycleId: inserted.id };
}

export type ThreeSixtyCycleActionState =
  | { status: "success" }
  | { status: "error"; message: "forbidden" | "invalid_input" | "unknown" }
  | null;

/**
 * Activates a 'draft' cycle. Only one cycle may be 'active' at a time
 * (`three_sixty_cycles_single_active_uidx`) -- attempting a second one
 * surfaces as a clear "another cycle is already active" message rather than
 * a raw constraint violation.
 */
export async function activateThreeSixtyCycle(
  _prevState: ThreeSixtyCycleActionState,
  formData: FormData
): Promise<ThreeSixtyCycleActionState> {
  const cycleId = formData.get("cycleId");
  if (typeof cycleId !== "string" || cycleId === "") {
    return { status: "error", message: "invalid_input" };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("three_sixty_cycles")
    .update({ status: "active" }, { count: "exact" })
    .eq("id", cycleId)
    .eq("status", "draft");

  if (error) {
    if (error.code === "23505") return { status: "error", message: "invalid_input" };
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!count) return { status: "error", message: "forbidden" };
  return { status: "success" };
}

/** Closes an 'active' cycle -- unlocks screens 4/5 (post-close reports). */
export async function closeThreeSixtyCycle(
  _prevState: ThreeSixtyCycleActionState,
  formData: FormData
): Promise<ThreeSixtyCycleActionState> {
  const cycleId = formData.get("cycleId");
  if (typeof cycleId !== "string" || cycleId === "") {
    return { status: "error", message: "invalid_input" };
  }
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("three_sixty_cycles")
    .update({ status: "closed" }, { count: "exact" })
    .eq("id", cycleId)
    .eq("status", "active");

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!count) return { status: "error", message: "forbidden" };
  return { status: "success" };
}
