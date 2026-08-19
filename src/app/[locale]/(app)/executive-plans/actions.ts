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
