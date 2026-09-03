"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const saveSchema = z.object({
  assignmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  optionId: z.string().uuid().optional(),
  numericValue: z.number().optional(),
  textValue: z.string().max(4000).optional(),
});

export type SaveResponseResult = { ok: true } | { ok: false; message: "forbidden" | "invalid_input" | "unknown" };

/**
 * Screen 3's "حفظ تلقائي للمسودة": called directly from the client on
 * every answer change (rating: on selection; open text: on blur) rather
 * than through a `<form>`/`useActionState` — each item saves
 * independently, so one slow request never blocks the others. Select-then
 * -insert-or-update against `three_sixty_responses_uidx (assignment_id,
 * item_id)` -- a REAL (non-partial) unique index here, but this project's
 * established discipline is still to check first so this stays a plain,
 * predictable UPDATE-or-INSERT rather than relying on `.upsert()`'s
 * PostgREST-inferred ON CONFLICT matching a constraint this table may not
 * keep forever.
 */
export async function saveThreeSixtyResponse(input: {
  assignmentId: string;
  itemId: string;
  optionId?: string;
  numericValue?: number;
  textValue?: string;
}): Promise<SaveResponseResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "invalid_input" };
  const { assignmentId, itemId, optionId, numericValue, textValue } = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("three_sixty_responses")
    .select("id")
    .eq("assignment_id", assignmentId)
    .eq("item_id", itemId)
    .maybeSingle();

  const patch = {
    assignment_id: assignmentId,
    item_id: itemId,
    option_id: optionId ?? null,
    numeric_value: numericValue ?? null,
    text_value: textValue ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("three_sixty_responses").update(patch).eq("id", existing.id)
    : await supabase.from("three_sixty_responses").insert(patch);

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { ok: false, message: "forbidden" };
    }
    return { ok: false, message: "unknown" };
  }
  return { ok: true };
}

export type SubmitAssignmentState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "forbidden" | "unknown" }
  | null;

/**
 * Final submission -- flips the assignment to 'submitted', locking it from
 * further edits (both `saveThreeSixtyResponse` and this action re-check the
 * assignment's own status server-side; the client only hides the controls).
 * Required items are checked here, not just in the UI, since a client-only
 * check can't be trusted (CLAUDE.md's "never trust the client" rule).
 */
export async function submitThreeSixtyAssignment(
  _prevState: SubmitAssignmentState,
  formData: FormData
): Promise<SubmitAssignmentState> {
  const assignmentId = formData.get("assignmentId");
  if (typeof assignmentId !== "string" || assignmentId === "") {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("three_sixty_assignments")
    .select("id, relationship_code, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) return { status: "error", message: "forbidden" };
  if (assignment.status !== "pending") return { status: "error", message: "invalid_input" };

  const { data: items } = await supabase
    .from("three_sixty_items")
    .select("id, required, rater_groups")
    .is("deleted_at", null);
  const applicableRequired = (items ?? []).filter(
    (item) => item.required && (item.rater_groups as string[]).includes(assignment.relationship_code)
  );

  const { data: responses } = await supabase
    .from("three_sixty_responses")
    .select("item_id, option_id, text_value")
    .eq("assignment_id", assignmentId);
  const answered = new Set(
    (responses ?? [])
      .filter((r) => r.option_id != null || (r.text_value != null && r.text_value.trim() !== ""))
      .map((r) => r.item_id)
  );

  const missing = applicableRequired.filter((item) => !answered.has(item.id));
  if (missing.length > 0) {
    return { status: "error", message: "invalid_input" };
  }

  const { error, count } = await supabase
    .from("three_sixty_assignments")
    .update({ status: "submitted" }, { count: "exact" })
    .eq("id", assignmentId)
    .eq("status", "pending");

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!count) return { status: "error", message: "forbidden" };
  return { status: "success" };
}
