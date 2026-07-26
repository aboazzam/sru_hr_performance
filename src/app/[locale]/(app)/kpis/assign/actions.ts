"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const assignKpiSchema = z
  .object({
    employeeId: z.string().uuid(),
    cycleId: z.string().uuid(),
    kpiLibraryId: z.string().uuid().optional(),
    customTitleAr: z.string().trim().min(1).optional(),
    targetValue: z.coerce.number(),
    actualValue: z.coerce.number().optional(),
    unitAr: z.string().trim().min(1),
    weight: z.coerce.number().min(0.01).max(100).optional(),
  })
  .refine((data) => Boolean(data.kpiLibraryId) !== Boolean(data.customTitleAr), {
    message: "exactly one of kpiLibraryId or customTitleAr is required",
  });

export type AssignKpiState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `kpis` row for an employee (the "الرئيس المباشر هو الذي يحدد
 * مؤشرات الاداء على مستوى الموظف" cascade) through the caller's own
 * RLS-respecting client — `kpis`' RLS (20260727000002) requires
 * check_vpra('kpiAssignment','prepare', orgUnitId) OR
 * is_my_direct_report(employeeId) for INSERT, with NO self-row bypass, so
 * this only ever succeeds for a real supervisor/manager (or a role at that
 * level), never a plain employee cascading a KPI onto themselves —
 * enforced by Postgres itself, not this action's code.
 */
export async function assignKpi(_prevState: AssignKpiState, formData: FormData): Promise<AssignKpiState> {
  const parsed = assignKpiSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
    kpiLibraryId: formData.get("kpiLibraryId") || undefined,
    customTitleAr: formData.get("customTitleAr") || undefined,
    targetValue: formData.get("targetValue"),
    actualValue: formData.get("actualValue") || undefined,
    unitAr: formData.get("unitAr"),
    weight: formData.get("weight") || undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();

  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  const { employeeId, cycleId, kpiLibraryId, customTitleAr, targetValue, actualValue, unitAr, weight } = parsed.data;

  const { data: kpi, error } = await supabase
    .from("kpis")
    .insert({
      employee_id: employeeId,
      cycle_id: cycleId,
      kpi_library_id: kpiLibraryId ?? null,
      custom_title_ar: customTitleAr ?? null,
      target_value: targetValue,
      actual_value: actualValue ?? null,
      unit_ar: unitAr,
      weight: weight ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "kpi_assigned",
    entity: "kpis",
    entity_id: kpi.id,
    after_data: {
      employee_id: employeeId,
      cycle_id: cycleId,
      kpi_library_id: kpiLibraryId ?? null,
      custom_title_ar: customTitleAr ?? null,
      target_value: targetValue,
      unit_ar: unitAr,
      weight: weight ?? null,
    },
  });

  return { status: "success" };
}
