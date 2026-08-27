"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cycleDependentTables, isValidWeights } from "@/lib/evaluationCycle";

export type EvaluationCycleActionState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "has_dependents" | "unknown";
    };

function mapError(error: { code?: string; message: string }): EvaluationCycleActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  // evaluation_cycles_dates_valid CHECK (end_date > start_date)
  if (error.code === "23514") {
    return { status: "error", message: "invalid_input" };
  }
  return { status: "error", message: "unknown" };
}

const updateSchema = z
  .object({
    cycleId: z.string().uuid(),
    nameAr: z.string().trim().min(1),
    nameEn: z.string().trim().nullable(),
    cycleType: z.enum(["academic", "calendar", "fiscal"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((data) => data.endDate > data.startDate, { message: "end date must be after start date" });

/**
 * Edits an existing cycle. `evaluation_cycles_update`'s RLS
 * (`check_vpra_global('evaluation','approve')`) has existed since
 * 20260719000011 with no consumer at all — until now a cycle could be
 * created but never corrected, so a typo in a name or a wrong end date was
 * permanent. Authorization stays entirely with that policy: an RLS-denied
 * UPDATE matches zero rows rather than erroring, which is reported as
 * "forbidden" instead of a silent success.
 */
export async function updateEvaluationCycle(input: {
  cycleId: string;
  nameAr: string;
  nameEn: string | null;
  cycleType: string;
  startDate: string;
  endDate: string;
}): Promise<EvaluationCycleActionState> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: before } = await supabase
    .from("evaluation_cycles")
    .select("name_ar, name_en, cycle_type, start_date, end_date")
    .eq("id", parsed.data.cycleId)
    .is("deleted_at", null)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("evaluation_cycles")
    .update({
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      cycle_type: parsed.data.cycleType,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
    })
    .eq("id", parsed.data.cycleId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "evaluation_cycle_updated",
    entity: "evaluation_cycles",
    entity_id: parsed.data.cycleId,
    before_data: before ?? null,
    after_data: {
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      cycle_type: parsed.data.cycleType,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
    },
  });

  return { status: "success" };
}

/**
 * Counts how many real records depend on a cycle, across every table with a
 * `cycle_id` FK. Read through the caller's own client, so each table's own
 * RLS applies — see `deleteEvaluationCycle` for why that is deliberately
 * conservative rather than a hole.
 */
export async function countEvaluationCycleUsage(
  cycleId: string
): Promise<{ status: "success"; counts: Record<string, number>; total: number } | { status: "error" }> {
  if (!z.string().uuid().safeParse(cycleId).success) return { status: "error" };

  const supabase = await createClient();
  const counts: Record<string, number> = {};
  let total = 0;

  for (const table of cycleDependentTables) {
    // Counts `cycle_id`, never `*`: `feedback_360` deliberately has NO
    // table-level SELECT grant (20260718000005 revoked it and re-granted an
    // explicit column list omitting `evaluator_id`, to hide evaluator
    // identity), so `select("*")` fails there — found live while verifying
    // this guard, where it silently produced a zero count and would have
    // let a cycle with real 360-feedback rows be soft-deleted.
    const { count, error } = await supabase
      .from(table)
      .select("cycle_id", { count: "exact", head: true })
      .eq("cycle_id", cycleId)
      .is("deleted_at", null);
    // A table the caller genuinely cannot read must never be silently
    // counted as zero — that would turn a permission gap into a deletion.
    if (error) return { status: "error" };
    if (count && count > 0) {
      counts[table] = count;
      total += count;
    }
  }

  return { status: "success", counts, total };
}

/**
 * Soft-deletes a cycle (CLAUDE.md §5-A rule 7 — the table has no DELETE
 * policy), but only when nothing depends on it.
 *
 * The dependency check is explicit and NOT left to the FKs: every
 * `cycle_id` FK is ON DELETE RESTRICT, which guards a hard DELETE only —
 * an UPDATE setting `deleted_at` would sail straight past them and strand
 * real evaluations/goals/promotions pointing at a cycle that has vanished
 * from every list. Same reasoning as `deleteLevel`'s check on the
 * org-structure screen.
 *
 * The counts come from the caller's own RLS-scoped client, so a caller who
 * cannot see some dependent rows counts fewer of them. That is deliberately
 * the conservative direction for a delete guard *only* in the sense that it
 * never invents dependents — it can under-count, so the gate is paired with
 * the `approve`-level RLS on the cycle itself (hr_admin/ceo/super_admin
 * today, all of whom hold broad read access to these tables).
 */
export async function deleteEvaluationCycle(cycleId: string): Promise<EvaluationCycleActionState> {
  if (!z.string().uuid().safeParse(cycleId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const usage = await countEvaluationCycleUsage(cycleId);
  if (usage.status === "error") return { status: "error", message: "unknown" };
  if (usage.total > 0) return { status: "error", message: "has_dependents" };

  const { data: deleted, error } = await supabase
    .from("evaluation_cycles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", cycleId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!deleted || deleted.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "evaluation_cycle_deleted",
    entity: "evaluation_cycles",
    entity_id: cycleId,
    after_data: { deleted: true },
  });

  return { status: "success" };
}

const weightsSchema = z
  .object({
    cycleId: z.string().uuid(),
    goals: z.number().min(0).max(100),
    competencies: z.number().min(0).max(100),
    bau: z.number().min(0).max(100),
    feedback360: z.number().min(0).max(100),
  })
  .refine(
    (data) =>
      isValidWeights({
        goals: data.goals,
        competencies: data.competencies,
        bau: data.bau,
        feedback360: data.feedback360,
      }),
    { message: "weights must total 100" }
  );

/**
 * Sets the cycle's split between the four evaluation methods.
 *
 * No new permission: this is a property of the cycle, so it rides on
 * `evaluation_cycles_update`'s existing RLS
 * (`check_vpra_global('evaluation','approve')`) exactly like the name and the
 * dates do. The total is validated here AND by the DB CHECK — the action's
 * check gives a usable message, the constraint makes it true regardless of how
 * a row is written.
 */
export async function updateCycleMethodWeights(input: {
  cycleId: string;
  goals: number;
  competencies: number;
  bau: number;
  feedback360: number;
}): Promise<EvaluationCycleActionState> {
  const parsed = weightsSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: before } = await supabase
    .from("evaluation_cycles")
    .select("weight_goals, weight_competencies, weight_bau, weight_feedback_360")
    .eq("id", parsed.data.cycleId)
    .is("deleted_at", null)
    .maybeSingle();

  const after = {
    weight_goals: parsed.data.goals,
    weight_competencies: parsed.data.competencies,
    weight_bau: parsed.data.bau,
    weight_feedback_360: parsed.data.feedback360,
  };

  const { data: updated, error } = await supabase
    .from("evaluation_cycles")
    .update(after)
    .eq("id", parsed.data.cycleId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "evaluation_cycle_weights_updated",
    entity: "evaluation_cycles",
    entity_id: parsed.data.cycleId,
    before_data: before ?? null,
    after_data: after,
  });

  return { status: "success" };
}
