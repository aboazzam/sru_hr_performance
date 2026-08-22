"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

const updatePlanSchema = z
  .object({
    planId: z.string().uuid(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startYear: z.coerce.number().int().min(2000).max(2200),
    endYear: z.coerce.number().int().min(2000).max(2200),
  })
  .refine((d) => d.endYear >= d.startYear, { path: ["endYear"] });

export async function updateStrategicPlan(_prevState: CreatePlanState, formData: FormData): Promise<CreatePlanState> {
  const parsed = updatePlanSchema.safeParse({
    planId: formData.get("planId"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startYear: formData.get("startYear"),
    endYear: formData.get("endYear"),
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { planId, nameAr, nameEn, startYear, endYear } = parsed.data;
  const { data: before } = await supabase
    .from("strategic_plans")
    .select("name_ar, name_en, start_year, end_year")
    .eq("id", planId)
    .maybeSingle();

  // .select() is load-bearing: an UPDATE blocked by RLS affects zero rows and
  // returns NO error, so without reading the rows back this would report a
  // save that never happened.
  const { data: saved, error } = await supabase
    .from("strategic_plans")
    .update({ name_ar: nameAr, name_en: nameEn || null, start_year: startYear, end_year: endYear })
    .eq("id", planId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) return { status: "error", message: "forbidden" };
    if (error.code === "23514") return { status: "error", message: "invalid_input" };
    return { status: "error", message: "unknown" };
  }
  if (!saved || saved.length === 0) return { status: "error", message: "forbidden" };

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_plan_updated",
      entity: "strategic_plans",
      entity_id: planId,
      before_data: before ?? null,
      after_data: { name_ar: nameAr, name_en: nameEn || null, start_year: startYear, end_year: endYear },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/kpis/plans", "page");
  revalidatePath("/[locale]/kpis/plans/[id]", "page");
  return { status: "success" };
}

export type DeletePlanState =
  | { status: "success"; counts: Record<string, number> }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Deletes a plan AND everything under it, in one transaction, via
 * soft_delete_strategic_plan() (20260822000001).
 *
 * The cascade lives in the database rather than here on purpose: doing it in
 * application code would take ~10 sequential round trips, and a failure
 * halfway would leave a half-deleted plan. The function is SECURITY INVOKER,
 * so every table's own `strategicPlanning='approve'` RLS still decides — this
 * action adds no gate of its own and grants nothing.
 *
 * Vision, mission and values are NOT touched: they are university-wide rows
 * with no plan_id, and the confirmation the caller sees says so.
 */
export async function deleteStrategicPlan(_prevState: DeletePlanState, formData: FormData): Promise<DeletePlanState> {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse({ planId: formData.get("planId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: before } = await supabase
    .from("strategic_plans")
    .select("name_ar, start_year, end_year")
    .eq("id", parsed.data.planId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("soft_delete_strategic_plan", { p_plan_id: parsed.data.planId });
  if (error) {
    // The function raises insufficient_privilege when the plan row itself was
    // not updated — RLS refused, or it was already gone.
    if (error.code === "42501" || error.message.includes("forbidden_or_missing")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  const counts = (data ?? {}) as Record<string, number>;

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "strategic_plan_deleted",
      entity: "strategic_plans",
      entity_id: parsed.data.planId,
      before_data: before ?? null,
      // What the cascade actually removed, so the trail says more than "a
      // plan was deleted".
      after_data: counts,
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/kpis/plans", "page");
  return { status: "success", counts };
}
