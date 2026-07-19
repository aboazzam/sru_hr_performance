"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evalTypes } from "@/lib/vpra";

// `feedback_360.evaluator_relation` reuses the exact same four values as
// `evaluations.eval_type` (self/supervisor/peer/customer) -- a documented,
// deliberate fact (SRU_System_Design.md marks this `[معتمد]`, and
// migration 20260718000005's own header notes the two enums share values)
// not a coincidence -- so this form reuses `evalTypes`/`evalTypeLabels`
// from vpra.ts rather than duplicating an identical label map.
const feedback360Schema = z
  .object({
    cycleId: z.string().uuid(),
    targetEmployeeId: z.string().uuid(),
    evaluatorRelation: z.enum(evalTypes as [string, ...string[]]),
    isAnonymous: z.coerce.boolean(),
    overallScore: z.coerce.number().min(0).max(100).optional(),
    comments: z.string().trim().max(4000).optional(),
  });

export type SubmitFeedback360State =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";
    }
  | null;

/**
 * Submits one `feedback_360` row (migration 20260718000005) through the
 * caller's own RLS-respecting client. `evaluator_id` is NEVER taken from
 * the form -- `feedback_360_insert`'s WITH CHECK requires
 * `evaluator_id = <caller's own profile id>`, so this action looks that up
 * itself from the authenticated session and always writes it as the
 * evaluator, matching CLAUDE.md's "never trust the client" rule and
 * making impersonating another evaluator structurally impossible, not
 * just discouraged in the UI.
 *
 * `feedback_360_insert` has NO VPRA gate at all (any authenticated user
 * with a profile can submit feedback about any target/cycle/relation) --
 * this is the table's existing, already-shipped authorization model, not
 * a decision made here.
 *
 * `scores` is a schemaless JSONB column with no documented question set
 * (SRU_System_Design.md's ERD sketch names the column but not its shape).
 * `[استنتاج]`: this form captures a single `overall_score` (0-100,
 * matching the percentage convention just resolved for
 * `evaluation_scores.score` in 20260719000001) rather than inventing a
 * multi-dimension rubric that isn't documented anywhere -- easy to extend
 * later since JSONB has no CHECK constraint to migrate.
 *
 * `submitted_at` is always set to `now()` here -- this action only ever
 * produces a submitted row, no separate draft-then-submit flow (the
 * column stays nullable at the DB level for a possible future draft
 * state, not used by this screen).
 *
 * A duplicate (cycle, target, evaluator, relation) hits
 * `feedback_360_unique_submission` and is reported as "duplicate," same
 * convention as `createEvaluation`'s handling of its own unique index.
 */
export async function submitFeedback360(
  _prevState: SubmitFeedback360State,
  formData: FormData
): Promise<SubmitFeedback360State> {
  const parsed = feedback360Schema.safeParse({
    cycleId: formData.get("cycleId"),
    targetEmployeeId: formData.get("targetEmployeeId"),
    evaluatorRelation: formData.get("evaluatorRelation"),
    isAnonymous: formData.get("isAnonymous") === "on",
    overallScore: formData.get("overallScore") || undefined,
    comments: formData.get("comments") || undefined,
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

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!myProfile) {
    return { status: "error", message: "forbidden" };
  }

  const { cycleId, targetEmployeeId, evaluatorRelation, isAnonymous, overallScore, comments } =
    parsed.data;

  // A 'self' relation must target the caller's own profile; any other
  // relation must target someone else -- not enforced at the DB layer
  // (no CHECK exists for it), a UX safeguard mirroring the
  // profiles_supervisor_not_self CHECK's spirit elsewhere in this schema.
  const isSelfRelation = evaluatorRelation === "self";
  if (isSelfRelation !== (targetEmployeeId === myProfile.id)) {
    return { status: "error", message: "invalid_input" };
  }

  const { error } = await supabase.from("feedback_360").insert({
    cycle_id: cycleId,
    target_employee_id: targetEmployeeId,
    evaluator_id: myProfile.id,
    evaluator_relation: evaluatorRelation,
    is_anonymous: isAnonymous,
    scores: overallScore !== undefined ? { overall_score: overallScore } : null,
    comments: comments || null,
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "duplicate" };
    }
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  return { status: "success" };
}
