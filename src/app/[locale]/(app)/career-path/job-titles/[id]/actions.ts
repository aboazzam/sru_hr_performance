"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobTitleErrorMessage = "invalid_input" | "unauthenticated" | "forbidden" | "duplicate" | "unknown";

export type JobTitleActionState = { status: "success" } | { status: "error"; message: JobTitleErrorMessage };

function mapError(error: { code?: string; message: string }): JobTitleActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  if (error.code === "23505") {
    return { status: "error", message: "duplicate" };
  }
  return { status: "error", message: "unknown" };
}

const updateDescriptionSchema = z.object({
  jobTitleId: z.string().uuid(),
  descriptionAr: z.string().trim().min(1),
});

/**
 * Updates a job title's Arabic job description. Real authorization is
 * job_titles_update's RLS (check_vpra_global('careerPath','prepare')),
 * enforced through the caller's own RLS-respecting client — the same bar
 * that already gates editing job_titles' other fields. Plain-argument
 * callable (not FormData-based), matching org-structure's
 * updatePosition/addPosition convention for actions invoked via
 * useTransition that stay on the same page rather than redirecting.
 */
export async function updateJobTitleDescription(
  jobTitleId: string,
  descriptionAr: string
): Promise<JobTitleActionState> {
  const parsed = updateDescriptionSchema.safeParse({ jobTitleId, descriptionAr });
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

  const { error } = await supabase
    .from("job_titles")
    .update({ description_ar: parsed.data.descriptionAr })
    .eq("id", parsed.data.jobTitleId);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_description_updated",
    entity: "job_titles",
    entity_id: parsed.data.jobTitleId,
    after_data: { description_ar: parsed.data.descriptionAr },
  });

  return { status: "success" };
}

const assignCompetencySchema = z.object({
  jobTitleId: z.string().uuid(),
  competencyId: z.string().uuid(),
  requiredLevel: z.enum(["basic", "practitioner", "advanced", "professional"]),
});

/**
 * Adds one required-competency row for a job title. real authorization is
 * job_title_competencies_insert's RLS (careerPath prepare+, 20260726000001).
 * The partial unique index (job_title_id, competency_id) WHERE
 * deleted_at IS NULL surfaces as a 23505 -> "duplicate" here. Plain-argument
 * callable, same reasoning as updateJobTitleDescription above.
 */
export async function assignJobTitleCompetency(
  jobTitleId: string,
  competencyId: string,
  requiredLevel: string
): Promise<JobTitleActionState> {
  const parsed = assignCompetencySchema.safeParse({ jobTitleId, competencyId, requiredLevel });
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

  const { data: inserted, error } = await supabase
    .from("job_title_competencies")
    .insert({
      job_title_id: parsed.data.jobTitleId,
      competency_id: parsed.data.competencyId,
      required_level: parsed.data.requiredLevel,
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_competency_assigned",
    entity: "job_title_competencies",
    entity_id: inserted.id,
    after_data: { job_title_id: parsed.data.jobTitleId, competency_id: parsed.data.competencyId, required_level: parsed.data.requiredLevel },
  });

  return { status: "success" };
}

const removeCompetencySchema = z.object({
  requirementId: z.string().uuid(),
});

/**
 * Soft-deletes one job_title_competencies row (CLAUDE.md §5-A rule 7 — no
 * hard delete). Plain-argument callable (not FormData-based), matching
 * org-structure's deletePosition/updatePosition convention for per-row
 * actions invoked via useTransition rather than a full <form>.
 */
export async function removeJobTitleCompetency(requirementId: string): Promise<JobTitleActionState> {
  const parsed = removeCompetencySchema.safeParse({ requirementId });
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

  const { error } = await supabase
    .from("job_title_competencies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.requirementId);

  if (error) return mapError(error);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_title_competency_removed",
    entity: "job_title_competencies",
    entity_id: parsed.data.requirementId,
  });

  return { status: "success" };
}
