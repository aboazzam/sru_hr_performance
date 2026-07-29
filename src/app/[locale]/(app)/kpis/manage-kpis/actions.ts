"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type KpiActionMessage = "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";
export type KpiActionState = { status: "success" } | { status: "error"; message: KpiActionMessage };

function mapError(error: { code?: string; message: string }): KpiActionMessage {
  if (error.code === "42501" || error.message.includes("row-level security")) return "forbidden";
  if (error.code === "23505") return "duplicate";
  if (error.code === "23514" || error.code === "23502") return "invalid_input";
  return "unknown";
}

/**
 * A KPI hangs off exactly ONE parent -- a strategic goal or a sub-goal --
 * mirroring strategic_kpis_parent_xor's own CHECK (20260730000001). The
 * refine enforces it here too so the caller gets a real validation message
 * rather than an opaque constraint violation.
 */
const createKpiSchema = z
  .object({
    goalId: z.string().uuid().optional(),
    subGoalId: z.string().uuid().optional(),
    titleAr: z.string().trim().min(1),
    titleEn: z.string().trim().optional(),
    unitAr: z.string().trim().min(1),
    unitEn: z.string().trim().optional(),
    planTargetValue: z.coerce.number().optional(),
    weight: z.coerce.number().min(0.01).max(100).optional(),
  })
  .refine((d) => Boolean(d.goalId) !== Boolean(d.subGoalId), {
    message: "exactly one parent (goalId or subGoalId) is required",
    path: ["goalId"],
  });

/**
 * Real authorization is `strategic_kpis_insert`'s own
 * check_vpra_global('strategicPlanning','approve') -- strategy_admin only,
 * per the project owner's "الاهداف والمؤشرات لا تتغير ... الا بقرار من صاحب
 * الصلاحية". Enforced by Postgres, not by this action.
 */
export async function createKpi(_prev: KpiActionState | null, formData: FormData): Promise<KpiActionState> {
  const parsed = createKpiSchema.safeParse({
    goalId: formData.get("goalId") || undefined,
    subGoalId: formData.get("subGoalId") || undefined,
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn") || undefined,
    unitAr: formData.get("unitAr"),
    unitEn: formData.get("unitEn") || undefined,
    planTargetValue: formData.get("planTargetValue") || undefined,
    weight: formData.get("weight") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  const { goalId, subGoalId, titleAr, titleEn, unitAr, unitEn, planTargetValue, weight } = parsed.data;

  const { error } = await supabase.from("strategic_kpis").insert({
    strategic_goal_id: goalId ?? null,
    sub_goal_id: subGoalId ?? null,
    title_ar: titleAr,
    title_en: titleEn || null,
    unit_ar: unitAr,
    unit_en: unitEn || null,
    plan_target_value: planTargetValue ?? null,
    weight: weight ?? null,
    created_by: myProfile?.id ?? null,
  });

  if (error) return { status: "error", message: mapError(error) };

  revalidatePath("/[locale]/kpis/manage-kpis", "page");
  return { status: "success" };
}

/** Soft-delete (deleted_at), never a hard DELETE -- no DELETE policy exists on
 *  strategic_kpis, same convention as org_structure_levels/strategic_values. */
export async function deleteKpi(kpiId: string): Promise<KpiActionState> {
  const parsed = z.string().uuid().safeParse(kpiId);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data, error } = await supabase
    .from("strategic_kpis")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .select("id");

  if (error) return { status: "error", message: mapError(error) };
  // A blocked UPDATE affects 0 rows without erroring -- not a success.
  if (!data || data.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/kpis/manage-kpis", "page");
  return { status: "success" };
}

const annualTargetSchema = z.object({
  kpiId: z.string().uuid(),
  cycleId: z.string().uuid(),
  targetValue: z.coerce.number(),
  actualValue: z.coerce.number().optional(),
});

/**
 * Sets the "مستهدف سنوي" for one KPI in one cycle -- the organization-level
 * figure evaluation is measured against. Deliberately select-then-insert-or-
 * update rather than .upsert(): kpi_annual_targets' uniqueness is a PARTIAL
 * index (WHERE deleted_at IS NULL), which PostgREST's on_conflict inference
 * cannot target -- the same limitation this project already hit on
 * evaluation_scores, calibration_results and org_structure_positions.
 */
export async function setKpiAnnualTarget(
  kpiId: string,
  cycleId: string,
  targetValue: string,
  actualValue: string
): Promise<KpiActionState> {
  const parsed = annualTargetSchema.safeParse({
    kpiId,
    cycleId,
    targetValue,
    actualValue: actualValue === "" ? undefined : actualValue,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { data: existing } = await supabase
    .from("kpi_annual_targets")
    .select("id")
    .eq("kpi_id", parsed.data.kpiId)
    .eq("cycle_id", parsed.data.cycleId)
    .is("deleted_at", null)
    .maybeSingle();

  const values = {
    target_value: parsed.data.targetValue,
    actual_value: parsed.data.actualValue ?? null,
  };

  const { data: written, error } = existing
    ? await supabase.from("kpi_annual_targets").update(values).eq("id", existing.id).select("id")
    : await supabase
        .from("kpi_annual_targets")
        .insert({
          kpi_id: parsed.data.kpiId,
          cycle_id: parsed.data.cycleId,
          ...values,
          created_by: myProfile?.id ?? null,
        })
        .select("id");

  if (error) return { status: "error", message: mapError(error) };
  if (!written || written.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/kpis/manage-kpis", "page");
  return { status: "success" };
}
