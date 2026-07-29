"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const updateProgressSchema = z.object({
  // "sub_goal" is gone as a progress-reporting node (2026-07-30): sub_goals
  // no longer carry actual_value at all -- progress now lives either on a
  // cascaded `targets` row (per department/employee) or on the
  // organization-level `kpi_annual_targets` row for that KPI and cycle.
  nodeType: z.enum(["target", "kpi_annual_target"]),
  id: z.string().uuid(),
  actualValue: z.coerce.number(),
});

export type UpdateProgressState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Updates actual_value (progress) on a `targets` or `kpi_annual_targets`
 * row through the caller's own RLS-respecting client. `targets_update`
 * (20260727000005) requires being the current owner of that exact row (or
 * of its immediate parent — covers reporting progress on an
 * employee-assigned leaf on their behalf); `kpi_annual_targets_update`
 * (20260730000001) is approve-only, since the organization-level annual
 * figure is a strategy_admin act. Both enforced by Postgres itself, not
 * this action's code.
 */
export async function updateProgress(_prevState: UpdateProgressState, formData: FormData): Promise<UpdateProgressState> {
  const parsed = updateProgressSchema.safeParse({
    nodeType: formData.get("nodeType"),
    id: formData.get("id"),
    actualValue: formData.get("actualValue"),
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

  const { nodeType, id, actualValue } = parsed.data;
  const table = nodeType === "kpi_annual_target" ? "kpi_annual_targets" : "targets";

  const { error, data } = await supabase.from(table).update({ actual_value: actualValue }).eq("id", id).select("id");

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!data || data.length === 0) {
    return { status: "error", message: "forbidden" };
  }

  revalidatePath("/[locale]/kpis", "page");
  return { status: "success" };
}
