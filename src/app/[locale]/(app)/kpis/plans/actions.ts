"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const createPlanSchema = z
  .object({
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startYear: z.coerce.number().int().min(2000).max(2200),
    endYear: z.coerce.number().int().min(2000).max(2200),
  })
  .refine((d) => d.endYear >= d.startYear, {
    message: "endYear must be >= startYear",
    path: ["endYear"],
  });

export type CreatePlanState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Creates a `strategic_plans` row -- the multi-year container a strategic
 * goal belongs to (20260730000001). Real authorization is
 * `strategic_plans_insert`'s own
 * check_vpra_global('strategicPlanning','approve'), strategy_admin-only,
 * enforced by Postgres rather than by this action.
 *
 * The endYear >= startYear refine mirrors the DB's own
 * strategic_plans_year_order CHECK -- validated here too so the caller
 * gets a field-level message instead of an opaque constraint violation.
 */
export async function createStrategicPlan(_prevState: CreatePlanState, formData: FormData): Promise<CreatePlanState> {
  const parsed = createPlanSchema.safeParse({
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startYear: formData.get("startYear"),
    endYear: formData.get("endYear"),
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

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { nameAr, nameEn, startYear, endYear } = parsed.data;

  const { error } = await supabase.from("strategic_plans").insert({
    name_ar: nameAr,
    name_en: nameEn || null,
    start_year: startYear,
    end_year: endYear,
    created_by: myProfile?.id ?? null,
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

  revalidatePath("/[locale]/kpis/plans", "page");
  return { status: "success" };
}
