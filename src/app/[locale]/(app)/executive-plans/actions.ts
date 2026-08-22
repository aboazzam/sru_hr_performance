"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type CreateExecutivePlanState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown" }
  | null;

const schema = z
  .object({
    strategicPlanId: z.string().uuid(),
    // Optional by design: production has no evaluation_cycles yet, and the
    // period is defined by the dates either way (20260820000001).
    cycleId: z.string().uuid().optional(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().trim().optional(),
  })
  // Mirrors the DB's own executive_plans_dates_valid CHECK, so the caller
  // gets a real message instead of an opaque constraint violation.
  .refine((d) => d.endDate >= d.startDate, { path: ["endDate"] });

export async function createExecutivePlan(
  _prev: CreateExecutivePlanState,
  formData: FormData
): Promise<CreateExecutivePlanState> {
  const parsed = schema.safeParse({
    strategicPlanId: formData.get("strategicPlanId"),
    cycleId: formData.get("cycleId") || undefined,
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const d = parsed.data;
  // Real authorization is executive_plans_insert's own
  // check_vpra_global('strategicPlanning','approve') — this write goes
  // through the caller's own client, not the service role.
  const { data: created, error } = await supabase
    .from("executive_plans")
    .insert({
      strategic_plan_id: d.strategicPlanId,
      cycle_id: d.cycleId ?? null,
      name_ar: d.nameAr,
      name_en: d.nameEn ?? null,
      start_date: d.startDate,
      end_date: d.endDate,
      ...(d.status ? { status: d.status } : {}),
      created_by: myProfile?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) return { status: "error", message: "forbidden" };
    // executive_plans_cycle_uidx: one plan per (strategic plan, cycle).
    if (error.code === "23505") return { status: "error", message: "duplicate" };
    if (error.code === "23514") return { status: "error", message: "invalid_input" };
    return { status: "error", message: "unknown" };
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_created",
      entity: "executive_plans",
      entity_id: created?.id ?? null,
      after_data: { strategic_plan_id: d.strategicPlanId, name_ar: d.nameAr, start_date: d.startDate, end_date: d.endDate },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans", "page");
  return { status: "success" };
}

const updateSchema = z
  .object({
    planId: z.string().uuid(),
    strategicPlanId: z.string().uuid(),
    cycleId: z.string().uuid().optional(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().trim().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { path: ["endDate"] });

export async function updateExecutivePlan(
  _prev: CreateExecutivePlanState,
  formData: FormData
): Promise<CreateExecutivePlanState> {
  const parsed = updateSchema.safeParse({
    planId: formData.get("planId"),
    strategicPlanId: formData.get("strategicPlanId"),
    cycleId: formData.get("cycleId") || undefined,
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const d = parsed.data;
  const { data: before } = await supabase
    .from("executive_plans")
    .select("name_ar, name_en, strategic_plan_id, cycle_id, start_date, end_date, status")
    .eq("id", d.planId)
    .maybeSingle();

  // .select() is load-bearing: an UPDATE blocked by RLS affects zero rows and
  // returns NO error, so without reading the rows back this would report a
  // save that never happened.
  const { data: saved, error } = await supabase
    .from("executive_plans")
    .update({
      strategic_plan_id: d.strategicPlanId,
      cycle_id: d.cycleId ?? null,
      name_ar: d.nameAr,
      name_en: d.nameEn ?? null,
      start_date: d.startDate,
      end_date: d.endDate,
      ...(d.status ? { status: d.status } : {}),
    })
    .eq("id", d.planId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) return { status: "error", message: "forbidden" };
    if (error.code === "23505") return { status: "error", message: "duplicate" };
    if (error.code === "23514") return { status: "error", message: "invalid_input" };
    return { status: "error", message: "unknown" };
  }
  if (!saved || saved.length === 0) return { status: "error", message: "forbidden" };

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_updated",
      entity: "executive_plans",
      entity_id: d.planId,
      before_data: before ?? null,
      after_data: {
        strategic_plan_id: d.strategicPlanId,
        cycle_id: d.cycleId ?? null,
        name_ar: d.nameAr,
        name_en: d.nameEn ?? null,
        start_date: d.startDate,
        end_date: d.endDate,
        status: d.status ?? null,
      },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans", "page");
  revalidatePath("/[locale]/executive-plans/[id]", "page");
  return { status: "success" };
}

/**
 * Soft-deletes one executive plan.
 *
 * Deliberately NOT a cascade, unlike soft_delete_strategic_plan(): nothing in
 * the schema references `executive_plans` (verified — no FK points at it).
 * An executive plan is a WINDOW onto the strategic plan's own targets and
 * initiatives, which keep belonging to that plan; deleting the window must
 * not delete what was visible through it. The confirmation the caller sees
 * says exactly that rather than borrowing the strategic plan's warning.
 */
export async function deleteExecutivePlan(
  _prev: CreateExecutivePlanState,
  formData: FormData
): Promise<CreateExecutivePlanState> {
  const parsed = z.object({ planId: z.string().uuid() }).safeParse({ planId: formData.get("planId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: before } = await supabase
    .from("executive_plans")
    .select("name_ar, start_date, end_date, status")
    .eq("id", parsed.data.planId)
    .maybeSingle();

  const { data: saved, error } = await supabase
    .from("executive_plans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.planId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) return { status: "error", message: "forbidden" };
    return { status: "error", message: "unknown" };
  }
  if (!saved || saved.length === 0) return { status: "error", message: "forbidden" };

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_deleted",
      entity: "executive_plans",
      entity_id: parsed.data.planId,
      before_data: before ?? null,
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans", "page");
  return { status: "success" };
}
