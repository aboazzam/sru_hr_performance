"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ExecutivePlanTargetState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "percentage_total" | "duplicate" | "unknown";
    }
  | null;

function mapError(error: { code?: string; message?: string } | null): ExecutivePlanTargetState {
  if (!error) return { status: "success" };
  const message = error.message ?? "";
  if (message.includes("must total 100")) return { status: "error", message: "percentage_total" };
  if (message.includes("duplicate org unit") || message.includes("duplicate employee")) {
    return { status: "error", message: "duplicate" };
  }
  if (error.code === "42501" || message.includes("row-level security")) return { status: "error", message: "forbidden" };
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profileId: null };
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  return { supabase, user, profileId: (profile?.id as string | undefined) ?? null };
}

const numberOrNull = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? null : Number(v)))
  .refine((v) => v == null || Number.isFinite(v), { message: "not a number" });

const selectSchema = z.object({
  executivePlanId: z.string().uuid(),
  strategicKpiId: z.string().uuid(),
  targetValue: numberOrNull,
});

/**
 * Pulls one of the strategic plan's KPIs into THIS executive plan's year, or
 * updates the year's value for one already pulled in.
 *
 * Real authorization is `executive_plan_targets`' own RLS
 * (`strategicPlanning='approve'`, 20260823000001) — enforced by Postgres, not
 * here. The insert-or-update is explicit rather than an `.upsert()`: the
 * uniqueness is a PARTIAL index (`WHERE deleted_at IS NULL`), which
 * PostgREST's `on_conflict` cannot target — the same limitation this project
 * has hit on evaluation_scores, calibration_results and org_structure
 * positions.
 */
export async function selectExecutivePlanTarget(
  _prev: ExecutivePlanTargetState,
  formData: FormData
): Promise<ExecutivePlanTargetState> {
  const parsed = selectSchema.safeParse({
    executivePlanId: formData.get("executivePlanId"),
    strategicKpiId: formData.get("strategicKpiId"),
    targetValue: formData.get("targetValue") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user, profileId } = await caller();
  if (!user) return { status: "error", message: "unauthenticated" };
  const d = parsed.data;

  const { data: existing } = await supabase
    .from("executive_plan_targets")
    .select("id")
    .eq("executive_plan_id", d.executivePlanId)
    .eq("strategic_kpi_id", d.strategicKpiId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    // .select() reads the rows back: an UPDATE blocked by RLS affects zero
    // rows and returns NO error.
    const { data: saved, error } = await supabase
      .from("executive_plan_targets")
      .update({ target_value: d.targetValue })
      .eq("id", existing.id)
      .select("id");
    if (error) return mapError(error);
    if (!saved || saved.length === 0) return { status: "error", message: "forbidden" };
  } else {
    const { error } = await supabase.from("executive_plan_targets").insert({
      executive_plan_id: d.executivePlanId,
      strategic_kpi_id: d.strategicKpiId,
      target_value: d.targetValue,
      created_by: profileId,
    });
    if (error) return mapError(error);
  }

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: existing ? "executive_plan_target_updated" : "executive_plan_target_selected",
      entity: "executive_plan_targets",
      entity_id: existing?.id ?? null,
      after_data: { executive_plan_id: d.executivePlanId, strategic_kpi_id: d.strategicKpiId, target_value: d.targetValue },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans/[id]", "page");
  return { status: "success" };
}

/** Drops a KPI back out of this year's plan. Soft-delete, like everything here. */
export async function unselectExecutivePlanTarget(
  _prev: ExecutivePlanTargetState,
  formData: FormData
): Promise<ExecutivePlanTargetState> {
  const parsed = z.object({ targetId: z.string().uuid() }).safeParse({ targetId: formData.get("targetId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await caller();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { data: saved, error } = await supabase
    .from("executive_plan_targets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.targetId)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!saved || saved.length === 0) return { status: "error", message: "forbidden" };

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_target_unselected",
      entity: "executive_plan_targets",
      entity_id: parsed.data.targetId,
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans/[id]", "page");
  return { status: "success" };
}

const shareSchema = z.object({
  targetId: z.string().uuid(),
  rows: z.array(z.object({ orgUnitId: z.string().uuid(), percentage: z.number().positive().max(100) })),
});

/**
 * Replaces a target's whole split across colleges/departments.
 *
 * The 100% rule lives in `save_executive_plan_target_org_units()` — one
 * transaction, validated before anything is touched, so a rejected save
 * leaves the existing split exactly as it was. The RPC is SECURITY INVOKER,
 * so RLS is still the gate and this action adds none of its own.
 */
export async function saveTargetOrgUnits(
  _prev: ExecutivePlanTargetState,
  formData: FormData
): Promise<ExecutivePlanTargetState> {
  let rows: Array<{ orgUnitId: string; percentage: number }>;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { status: "error", message: "invalid_input" };
  }
  const parsed = shareSchema.safeParse({ targetId: formData.get("targetId"), rows });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await caller();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.rpc("save_executive_plan_target_org_units", {
    p_target_id: parsed.data.targetId,
    p_rows: parsed.data.rows.map((r) => ({ org_unit_id: r.orgUnitId, percentage: r.percentage, notes: null })),
  });
  if (error) return mapError(error);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_target_units_saved",
      entity: "executive_plan_target_org_units",
      entity_id: parsed.data.targetId,
      after_data: { rows: parsed.data.rows },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans/[id]", "page");
  return { status: "success" };
}

const employeeShareSchema = z.object({
  shareId: z.string().uuid(),
  rows: z.array(z.object({ employeeId: z.string().uuid(), percentage: z.number().positive().max(100) })),
});

/**
 * Replaces one unit's whole split of its share across its own staff.
 *
 * The percentages are of the UNIT's share, not of the whole target: a
 * department holding 40% that gives an employee 50% has given them 20% of the
 * target. `save_executive_plan_target_employees()` enforces the 100%-of-the-
 * share rule in one transaction, validated before anything is touched.
 *
 * Authorization is the RPC's own RLS (20260823000001): the global
 * `strategicPlanning='approve'`, OR the scoped `check_vpra(...,'prepare', the
 * share's own unit)` — which is how a dean or department manager writes
 * inside their unit and nowhere else. This action adds no gate of its own.
 */
export async function saveTargetEmployees(
  _prev: ExecutivePlanTargetState,
  formData: FormData
): Promise<ExecutivePlanTargetState> {
  let rows: Array<{ employeeId: string; percentage: number }>;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { status: "error", message: "invalid_input" };
  }
  const parsed = employeeShareSchema.safeParse({ shareId: formData.get("shareId"), rows });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const { supabase, user } = await caller();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.rpc("save_executive_plan_target_employees", {
    p_share_id: parsed.data.shareId,
    p_rows: parsed.data.rows.map((r) => ({ employee_id: r.employeeId, percentage: r.percentage, notes: null })),
  });
  if (error) return mapError(error);

  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "executive_plan_target_employees_saved",
      entity: "executive_plan_target_employees",
      entity_id: parsed.data.shareId,
      after_data: { rows: parsed.data.rows },
    });
  } catch {
    // A failed audit write must not fail a write that already happened.
  }

  revalidatePath("/[locale]/executive-plans/[id]", "page");
  revalidatePath("/[locale]/profile", "page");
  return { status: "success" };
}
