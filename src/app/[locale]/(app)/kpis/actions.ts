"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const updateProgressSchema = z.object({
  nodeType: z.enum(["sub_goal", "target"]),
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
 * Updates actual_value (progress) on a `sub_goals` or `targets` row through
 * the caller's own RLS-respecting client. `sub_goals_update`/
 * `targets_update` (20260727000005) require being the current owner of
 * that exact row (or, for a target, of its immediate parent — covers
 * reporting progress on an employee-assigned leaf on their behalf) —
 * enforced by Postgres itself, not this action's code.
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
  const table = nodeType === "sub_goal" ? "sub_goals" : "targets";

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
