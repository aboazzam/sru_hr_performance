"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaveEvaluationScoresState =
  | { status: "success" }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "not_found" | "forbidden" | "unknown";
    }
  | null;

const scoreFieldSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v))
  .pipe(z.string().refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100), {
    message: "score out of range",
  }).nullable());

/**
 * Saves competency/goal scores for one evaluation (`evaluation_scores`,
 * migration 20260718000006). The set of competencies/goals scored is NOT
 * trusted from the client — it's re-derived here from `competencies` (the
 * full framework, since no per-employee/job-family filtering mechanism
 * exists yet — CLAUDE.md doesn't document one, flagged as a follow-up, not
 * invented here) and `goals` (the employee's own goals for this
 * evaluation's cycle), then matched against form fields named
 * `score_competency_<id>` / `comment_competency_<id>` and
 * `score_goal_<id>` / `comment_goal_<id>`. A client can only ever affect
 * rows for subjects that genuinely apply to this evaluation.
 *
 * Each row is written through the caller's own RLS-respecting client —
 * real authorization is `evaluation_scores`' own INSERT/UPDATE policies
 * (self-row has no bypass; `check_vpra('evaluation','approve'|'recommend',
 * ...)` or `is_my_direct_report()` — 20260719000002/000003), not
 * application code. No `upsert()` is used: `evaluation_scores`' uniqueness
 * is enforced via two PARTIAL indexes (`WHERE competency_id IS NOT NULL` /
 * `WHERE goal_id IS NOT NULL`), and PostgREST's `on_conflict` inference
 * doesn't carry a WHERE predicate, so a plain upsert would fail with "no
 * unique or exclusion constraint matching the ON CONFLICT specification."
 * Doing an explicit select-then-insert-or-update per row avoids that
 * entirely, at the cost of more round trips — acceptable for this
 * internal tool's row counts (dozens, not thousands).
 */
export async function saveEvaluationScores(
  evaluationId: string,
  _prevState: SaveEvaluationScoresState,
  formData: FormData
): Promise<SaveEvaluationScoresState> {
  const parsedId = z.string().uuid().safeParse(evaluationId);
  if (!parsedId.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: evaluation } = await supabase
    .from("evaluations")
    .select("id, employee_id, cycle_id")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (!evaluation) {
    return { status: "error", message: "not_found" };
  }

  const { data: competencies } = await supabase
    .from("competencies")
    .select("id")
    .is("deleted_at", null);

  // Activities replaced strategic targets as the "results" subject
  // (20260828000001): the weight is named for what it actually weighs.
  const { data: activities } = await supabase
    .from("initiative_activities")
    .select("id")
    .eq("responsible_profile_id", evaluation.employee_id)
    .is("deleted_at", null);

  // Routine tasks became scorable in 20260827000002 -- until then the cycle
  // could weight them but nothing could carry the score.
  const { data: bauTasks } = await supabase
    .from("bau_tasks")
    .select("id")
    .eq("employee_id", evaluation.employee_id)
    .eq("cycle_id", evaluation.cycle_id)
    .is("deleted_at", null);

  type Row = { subjectColumn: "competency_id" | "activity_id" | "bau_task_id"; subjectId: string; score: string | null; comment: string | null };
  const rows: Row[] = [];

  for (const competency of competencies ?? []) {
    const scoreParsed = scoreFieldSchema.safeParse(formData.get(`score_competency_${competency.id}`)?.toString());
    const comment = formData.get(`comment_competency_${competency.id}`)?.toString().trim();
    if (!scoreParsed.success) {
      return { status: "error", message: "invalid_input" };
    }
    rows.push({
      subjectColumn: "competency_id",
      subjectId: competency.id,
      score: scoreParsed.data,
      comment: comment || null,
    });
  }

  for (const activity of activities ?? []) {
    const scoreParsed = scoreFieldSchema.safeParse(formData.get(`score_activity_${activity.id}`)?.toString());
    const comment = formData.get(`comment_activity_${activity.id}`)?.toString().trim();
    if (!scoreParsed.success) {
      return { status: "error", message: "invalid_input" };
    }
    rows.push({
      subjectColumn: "activity_id",
      subjectId: activity.id,
      score: scoreParsed.data,
      comment: comment || null,
    });
  }

  for (const task of bauTasks ?? []) {
    const scoreParsed = scoreFieldSchema.safeParse(formData.get(`score_bau_${task.id}`)?.toString());
    const comment = formData.get(`comment_bau_${task.id}`)?.toString().trim();
    if (!scoreParsed.success) {
      return { status: "error", message: "invalid_input" };
    }
    rows.push({
      subjectColumn: "bau_task_id",
      subjectId: task.id,
      score: scoreParsed.data,
      comment: comment || null,
    });
  }

  let touchedCompetencies = 0;
  let touchedActivities = 0;
  let touchedBauTasks = 0;

  for (const row of rows) {
    const { data: existing } = await supabase
      .from("evaluation_scores")
      .select("id")
      .eq("evaluation_id", parsedId.data)
      .eq(row.subjectColumn, row.subjectId)
      .maybeSingle();

    // Nothing to save and nothing to clear — skip, don't create an
    // all-null row for a subject the reviewer never touched.
    if (!existing && row.score === null && row.comment === null) {
      continue;
    }

    const payload = { score: row.score === null ? null : Number(row.score), comment: row.comment };

    const { error } = existing
      ? await supabase.from("evaluation_scores").update(payload).eq("id", existing.id)
      : await supabase
          .from("evaluation_scores")
          .insert({ evaluation_id: parsedId.data, [row.subjectColumn]: row.subjectId, ...payload });

    if (error) {
      if (error.code === "42501" || error.message.includes("row-level security")) {
        return { status: "error", message: "forbidden" };
      }
      if (error.code === "23514") {
        return { status: "error", message: "invalid_input" };
      }
      return { status: "error", message: "unknown" };
    }

    if (row.subjectColumn === "competency_id") touchedCompetencies++;
    else if (row.subjectColumn === "activity_id") touchedActivities++;
    else touchedBauTasks++;
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "evaluation_scores_saved",
    entity: "evaluation_scores",
    entity_id: parsedId.data,
    after_data: {
      competencies_saved: touchedCompetencies,
      activities_saved: touchedActivities,
      bau_tasks_saved: touchedBauTasks,
    },
  });

  return { status: "success" };
}
