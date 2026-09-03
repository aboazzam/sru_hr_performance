"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  cycleId: z.string().uuid(),
  subjectEmployeeId: z.string().uuid(),
  decision: z.enum(["approved", "returned"]),
  notes: z.string().trim().max(2000).optional(),
});

export type ReviewNominationsState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Screen 2's second half: the direct supervisor approves or returns their
 * report's WHOLE submitted nomination list at once (all rows currently
 * 'submitted' for this cycle+subject) -- a per-row approve wasn't asked
 * for ("اعتماد الرئيس المباشر للقائمة", the LIST). Approving also creates
 * the real `three_sixty_assignments` rows (status starts 'pending', ready
 * for the rater to fill in screen 3) -- this orchestration lives here, in
 * application code, not a DB trigger, matching how `reviewPromotion`/
 * `createEvaluation` etc. handle multi-step writes elsewhere in this app.
 */
export async function reviewThreeSixtyNominations(
  _prevState: ReviewNominationsState,
  formData: FormData
): Promise<ReviewNominationsState> {
  const parsed = schema.safeParse({
    cycleId: formData.get("cycleId"),
    subjectEmployeeId: formData.get("subjectEmployeeId"),
    decision: formData.get("decision"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!myProfile) return { status: "error", message: "forbidden" };

  const { cycleId, subjectEmployeeId, decision, notes } = parsed.data;

  const { data: submittedRows, error: fetchError } = await supabase
    .from("three_sixty_nominations")
    .select("id, relationship_code, rater_employee_id")
    .eq("cycle_id", cycleId)
    .eq("subject_employee_id", subjectEmployeeId)
    .eq("status", "submitted")
    .is("deleted_at", null);

  if (fetchError) return { status: "error", message: "unknown" };
  if (!submittedRows || submittedRows.length === 0) return { status: "error", message: "invalid_input" };

  const { error: updateError, count } = await supabase
    .from("three_sixty_nominations")
    .update(
      {
        status: decision,
        reviewed_by: myProfile.id,
        reviewed_at: new Date().toISOString(),
        review_notes: notes ?? null,
      },
      { count: "exact" }
    )
    .in(
      "id",
      submittedRows.map((r) => r.id)
    );

  if (updateError) {
    if (updateError.code === "42501" || updateError.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!count) return { status: "error", message: "forbidden" };

  if (decision === "approved") {
    const { data: existingAssignments } = await supabase
      .from("three_sixty_assignments")
      .select("relationship_code, rater_employee_id")
      .eq("cycle_id", cycleId)
      .eq("subject_employee_id", subjectEmployeeId)
      .is("deleted_at", null);
    const existingKeys = new Set((existingAssignments ?? []).map((a) => `${a.relationship_code}::${a.rater_employee_id}`));

    const toInsert = submittedRows
      .filter((r) => !existingKeys.has(`${r.relationship_code}::${r.rater_employee_id}`))
      .map((r) => ({
        cycle_id: cycleId,
        subject_employee_id: subjectEmployeeId,
        rater_employee_id: r.rater_employee_id,
        relationship_code: r.relationship_code,
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("three_sixty_assignments").insert(toInsert);
      if (insertError) return { status: "error", message: "unknown" };
    }
  }

  return { status: "success" };
}
