"use server";

// ============================================================================
// طلبات الاحتياج الوظيفي -- Server Actions
//
// Two hard rules, both inherited from how this codebase already handles
// evaluation state transitions (CLAUDE.md §4-A, `transitionEvaluation`):
//
//  1. The CURRENT status is never accepted from the client. Every transition
//     re-reads it from the database first, so a stale or forged form value
//     cannot drive the state machine.
//  2. `recruitmentWorkflow.ts` is the ONLY authority on whether a transition
//     is legal. No `if (role === ...)` anywhere in here or in the UI.
//
// Authorization is layered, not duplicated: the guard decides "is this
// transition legal for someone at my VPRA level", while Postgres decides
// "may I touch THIS row at all" via `recruitment_requests`' org-scoped RLS
// (20260807000002). Neither is a substitute for the other -- the guard
// cannot see org-unit scope, and RLS cannot see the state machine.
// ============================================================================

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProcessArea, VpraLevel } from "@/lib/vpra";
import {
  evaluateRequestTransition,
  isRequestDecided,
  requestTransitions,
  type RecruitmentPermissions,
  type TransitionRefusal,
} from "@/lib/recruitmentWorkflow";
import { requestTransitionNotification } from "@/lib/notificationTemplates";
import { notify, profilesWithAccess } from "@/lib/notify";

export type RecruitmentRequestErrorMessage =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "no_profile"
  | "duplicate"
  | "unknown"
  | TransitionRefusal;

export type RecruitmentRequestActionState =
  | { status: "success"; createdCount?: number; skippedCount?: number }
  | { status: "error"; message: RecruitmentRequestErrorMessage };

function mapError(error: { code?: string; message: string }): RecruitmentRequestActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  if (error.code === "23505") return { status: "error", message: "duplicate" };
  if (error.code === "23514" || error.code === "23502") {
    return { status: "error", message: "invalid_input" };
  }
  return { status: "error", message: "unknown" };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** The caller's own levels across every area, shaped for the guard. */
async function myPermissions(supabase: Client): Promise<RecruitmentPermissions> {
  const { data } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (data ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  return permissions;
}

/** The caller's own `profiles.id` — never taken from the client. */
async function myProfileId(supabase: Client): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

async function auditLog(
  actorId: string,
  action: string,
  entityId: string | null,
  before: unknown,
  after: unknown
) {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity: "recruitment_requests",
    entity_id: entityId,
    before_data: before as Record<string, unknown>,
    after_data: after as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    orgUnitId: z.string().uuid(),
    jobTitleId: z.string().uuid().optional(),
    customJobTitle: z.string().trim().min(1).optional(),
    headcount: z.number().int().min(1).max(1000),
    requestReason: z.enum(["vacant", "expansion", "replacement"]),
    contractType: z.enum(["permanent", "temporary", "part_time"]),
    salaryGrade: z.number().int().min(1).max(16).optional(),
    proposedQuarter: z.number().int().min(1).max(4).optional(),
    // نفس مفردات profiles.gender وقيد CHECK في 20260808000002.
    gender: z.enum(["Male", "Female"]).optional(),
    proposedMonth: z.number().int().min(1).max(12).optional(),
    qualifications: z.string().trim().optional(),
    evaluationId: z.string().uuid().optional(),
    estimatedCostByRequester: z.number().min(0).optional(),
    strategicProjectRef: z.string().trim().optional(),
    competencyIds: z.array(z.string().uuid()).optional(),
  })
  // Mirrors the DB's own `recruitment_requests_job_title_source` CHECK, so a
  // bad request is refused with a readable message instead of a raw 23514.
  .refine((value) => Boolean(value.jobTitleId) || Boolean(value.customJobTitle), {
    message: "job title required",
  });

export type CreateRecruitmentRequestInput = z.input<typeof createSchema>;

/**
 * Raises a demand request. Always starts at `draft` — the status is never
 * accepted from the caller, so nothing can be created already-submitted and
 * skip its own unit's review.
 *
 * Real authorization is `recruitment_requests_insert`'s RLS:
 * `check_vpra('recruitmentPlan','prepare', org_unit_id)` AND
 * `requested_by = my own profile`. A section head scoped to their own unit
 * therefore cannot raise a request for another department, and cannot forge
 * authorship — both enforced by Postgres, both verified adversarially.
 */
export async function createRecruitmentRequest(
  input: CreateRecruitmentRequestInput
): Promise<RecruitmentRequestActionState> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const profileId = await myProfileId(supabase);
  if (!profileId) return { status: "error", message: "no_profile" };

  const data = parsed.data;
  const { data: created, error } = await supabase
    .from("recruitment_requests")
    .insert({
      org_unit_id: data.orgUnitId,
      requested_by: profileId,
      job_title_id: data.jobTitleId ?? null,
      custom_job_title: data.jobTitleId ? null : (data.customJobTitle ?? null),
      headcount: data.headcount,
      request_reason: data.requestReason,
      contract_type: data.contractType,
      salary_grade: data.salaryGrade ?? null,
      proposed_quarter: data.proposedQuarter ?? null,
      gender: data.gender ?? null,
      proposed_month: data.proposedMonth ?? null,
      qualifications: data.qualifications ?? null,
      evaluation_id: data.evaluationId ?? null,
      estimated_cost_by_requester: data.estimatedCostByRequester ?? null,
      strategic_project_ref: data.strategicProjectRef ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  // Competency links go through the caller's own client too, so the same
  // org-scoped gate applies to them via their parent request.
  if (data.competencyIds && data.competencyIds.length > 0) {
    const { error: linkError } = await supabase.from("recruitment_request_competencies").insert(
      data.competencyIds.map((competencyId) => ({
        request_id: created.id,
        competency_id: competencyId,
      }))
    );
    if (linkError) return mapError(linkError);
  }

  await auditLog(actor.id, "recruitment_request_created", created.id, null, {
    org_unit_id: data.orgUnitId,
    headcount: data.headcount,
    status: "draft",
  });
  return { status: "success" };
}

const updateSchema = z.object({
  requestId: z.string().uuid(),
  headcount: z.number().int().min(1).max(1000),
  requestReason: z.enum(["vacant", "expansion", "replacement"]),
  contractType: z.enum(["permanent", "temporary", "part_time"]),
  proposedQuarter: z.number().int().min(1).max(4).nullable(),
  qualifications: z.string().trim().nullable(),
  estimatedCostByRequester: z.number().min(0).nullable(),
});

/**
 * Edits a request's own content. Deliberately cannot touch `status`,
 * `plan_id` or `estimated_cost_by_hr` — those move only through the guarded
 * transition action and HR's own pricing action, so an edit form can never
 * become a back door around the state machine.
 *
 * Only a request that is still editable may be changed: `draft` (not yet
 * submitted) or `returned_for_revision` (sent back precisely to be fixed).
 */
export async function updateRecruitmentRequest(input: {
  requestId: string;
  headcount: number;
  requestReason: string;
  contractType: string;
  proposedQuarter: number | null;
  qualifications: string | null;
  estimatedCostByRequester: number | null;
}): Promise<RecruitmentRequestActionState> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: current } = await supabase
    .from("recruitment_requests")
    .select("id, status")
    .eq("id", parsed.data.requestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { status: "error", message: "not_found" };
  if (current.status !== "draft" && current.status !== "returned_for_revision") {
    return { status: "error", message: "forbidden" };
  }

  const { data: updated, error } = await supabase
    .from("recruitment_requests")
    .update({
      headcount: parsed.data.headcount,
      request_reason: parsed.data.requestReason,
      contract_type: parsed.data.contractType,
      proposed_quarter: parsed.data.proposedQuarter,
      qualifications: parsed.data.qualifications,
      estimated_cost_by_requester: parsed.data.estimatedCostByRequester,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.requestId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  // RLS refuses an UPDATE by matching zero rows, not by raising.
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_request_updated", parsed.data.requestId, current, parsed.data);
  return { status: "success" };
}

/** Soft-delete (CLAUDE.md §5-A rule 7) — only while still a draft. */
export async function deleteRecruitmentRequest(
  requestId: string
): Promise<RecruitmentRequestActionState> {
  if (!z.string().uuid().safeParse(requestId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: current } = await supabase
    .from("recruitment_requests")
    .select("id, status, plan_id")
    .eq("id", requestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { status: "error", message: "not_found" };
  // A request already consolidated into a plan is part of an approved (or
  // in-flight) budget document; removing it must go through the plan, not a
  // silent delete here.
  if (current.status !== "draft" || current.plan_id) {
    return { status: "error", message: "forbidden" };
  }

  const { data: deleted, error } = await supabase
    .from("recruitment_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!deleted || deleted.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_request_deleted", requestId, current, null);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Guarded transition
// ---------------------------------------------------------------------------

const transitionSchema = z.object({
  requestId: z.string().uuid(),
  toStatus: z.string().min(1),
  note: z.string().trim().optional(),
});

/**
 * The one and only way a request's status changes. The caller supplies the
 * TARGET status and (when required) a reason — never the current status,
 * which is read here from the row itself.
 */
export async function transitionRecruitmentRequest(input: {
  requestId: string;
  toStatus: string;
  note?: string;
}): Promise<RecruitmentRequestActionState> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: current } = await supabase
    .from("recruitment_requests")
    .select("id, status, plan_id, requested_by, job_title_id, custom_job_title")
    .eq("id", parsed.data.requestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!current) return { status: "error", message: "not_found" };

  const permissions = await myPermissions(supabase);
  const verdict = evaluateRequestTransition(current.status, parsed.data.toStatus, {
    permissions,
    note: parsed.data.note,
  });
  if (!verdict.allowed) return { status: "error", message: verdict.refusal };

  const { data: updated, error } = await supabase
    .from("recruitment_requests")
    .update({
      status: parsed.data.toStatus,
      decision_note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.requestId)
    // Optimistic concurrency: if someone else moved the row between our read
    // and this write, match zero rows rather than overwrite their decision.
    .eq("status", current.status)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(
    actor.id,
    "recruitment_request_transitioned",
    parsed.data.requestId,
    { status: current.status },
    { status: parsed.data.toStatus, note: parsed.data.note ?? null }
  );

  await notifyRequestTransition({
    requestId: parsed.data.requestId,
    toStatus: parsed.data.toStatus,
    note: parsed.data.note,
    requestedBy: current.requested_by,
    jobTitleId: current.job_title_id,
    customJobTitle: current.custom_job_title,
    supabase,
  });

  return { status: "success" };
}

/**
 * Notifies the request's own author plus whoever can act NEXT — derived from
 * the transition table itself (every rule leaving the new state), so a rule
 * added later automatically reaches the right people with no change here.
 *
 * Deliberately never throws: a notification failure must not undo a
 * transition that already happened and was audited.
 */
async function notifyRequestTransition(input: {
  requestId: string;
  toStatus: string;
  note?: string;
  requestedBy: string | null;
  jobTitleId: string | null;
  customJobTitle: string | null;
  supabase: Client;
}) {
  try {
    let jobTitle = input.customJobTitle ?? "";
    if (!jobTitle && input.jobTitleId) {
      const { data } = await input.supabase
        .from("job_titles")
        .select("name_ar")
        .eq("id", input.jobTitleId)
        .maybeSingle();
      jobTitle = data?.name_ar ?? "";
    }

    const admin = createAdminClient();
    const nextActors = requestTransitions
      .filter((rule) => rule.from === input.toStatus)
      .map((rule) => rule.requires);

    const recipients = [input.requestedBy, ...(await profilesWithAccess(admin, nextActors))];
    await notify(
      admin,
      recipients,
      requestTransitionNotification({
        toStatus: input.toStatus,
        jobTitle: jobTitle || "طلب احتياج",
        reason: input.note,
      }),
      "recruitment_requests",
      input.requestId
    );
  } catch (error) {
    console.error("notifyRequestTransition failed", error);
  }
}

// ---------------------------------------------------------------------------
// HR consolidation
// ---------------------------------------------------------------------------

const consolidateSchema = z.object({
  planId: z.string().uuid(),
  requestIds: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * Merges the chosen requests into one plan: each becomes a real plan item
 * and moves to `included_in_plan`.
 *
 * The set of requests is re-read from the database and re-checked against
 * the guard one by one — a request the caller may not move, or that is not
 * in a mergeable state, is SKIPPED rather than failing the whole batch, so
 * one stale checkbox cannot lose an entire merge. The counts come back so
 * the screen can say exactly what happened.
 *
 * Cost: seeded from the real `salary_scale.step_a` for the request's job
 * title when HR has not priced it, exactly as `addRecruitmentPlanItem`
 * already does — a plan's numbers come from data this database holds, never
 * from thin air. HR's own estimate wins when present.
 */
export async function consolidateRequestsIntoPlan(input: {
  planId: string;
  requestIds: string[];
}): Promise<RecruitmentRequestActionState> {
  const parsed = consolidateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, status")
    .eq("id", parsed.data.planId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { status: "error", message: "not_found" };
  // Merging into a plan that has already left HR's hands would silently
  // change what finance reviewed or what the authority approved.
  if (plan.status !== "draft") return { status: "error", message: "forbidden" };

  const { data: requests } = await supabase
    .from("recruitment_requests")
    .select(
      "id, status, org_unit_id, job_title_id, headcount, proposed_quarter, estimated_cost_by_hr, estimated_cost_by_requester, request_reason"
    )
    .in("id", parsed.data.requestIds)
    .is("deleted_at", null);

  const permissions = await myPermissions(supabase);
  let created = 0;
  let skipped = 0;

  for (const request of requests ?? []) {
    const verdict = evaluateRequestTransition(request.status, "included_in_plan", { permissions });
    if (!verdict.allowed) {
      skipped += 1;
      continue;
    }

    let cost = request.estimated_cost_by_hr ?? request.estimated_cost_by_requester ?? null;
    if (cost == null && request.job_title_id) {
      const { data: salary } = await supabase
        .from("salary_scale")
        .select("step_a")
        .eq("job_title_id", request.job_title_id)
        .maybeSingle();
      cost = salary?.step_a ?? null;
    }

    const { error: itemError } = await supabase.from("recruitment_plan_items").insert({
      plan_id: parsed.data.planId,
      request_id: request.id,
      org_unit_id: request.org_unit_id,
      job_title_id: request.job_title_id,
      headcount: request.headcount,
      target_quarter: request.proposed_quarter,
      estimated_monthly_cost: cost,
      // The item's `justification` is NOT filled from the request's
      // `qualifications`: those are different facts (why the hire is needed
      // vs. what the hire must hold). The item links back via `request_id`,
      // so the request's own fields stay readable without being duplicated
      // into a column that means something else.
      justification: null,
    });
    if (itemError) {
      // Includes the (plan_id, request_id) unique index catching a request
      // that is already in this plan — a skip, not a failure.
      skipped += 1;
      continue;
    }

    const { data: moved } = await supabase
      .from("recruitment_requests")
      .update({
        plan_id: parsed.data.planId,
        status: "included_in_plan",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("status", request.status)
      .is("deleted_at", null)
      .select("id");

    if (!moved || moved.length === 0) {
      skipped += 1;
      continue;
    }
    created += 1;
  }

  await auditLog(actor.id, "recruitment_requests_consolidated", parsed.data.planId, null, {
    requested: parsed.data.requestIds.length,
    created,
    skipped,
  });
  return { status: "success", createdCount: created, skippedCount: skipped };
}

const hrCostSchema = z.object({
  requestId: z.string().uuid(),
  estimatedCostByHr: z.number().min(0).nullable(),
});

/**
 * HR's own cost estimate on a request. Separate from the requester's figure
 * (both columns exist on purpose, so the plan shows what was asked for
 * against what HR priced it at) and separate from the edit action, since
 * this is the one field a requester must NOT be able to set.
 */
export async function setRequestHrCost(input: {
  requestId: string;
  estimatedCostByHr: number | null;
}): Promise<RecruitmentRequestActionState> {
  const parsed = hrCostSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const permissions = await myPermissions(supabase);
  // Pricing is HR's act, so it needs HR's own tier — 'prepare' (a section
  // head) is deliberately not enough.
  const level = permissions.recruitmentPlan ?? "none";
  if (level !== "recommend" && level !== "approve") {
    return { status: "error", message: "forbidden" };
  }

  const { data: updated, error } = await supabase
    .from("recruitment_requests")
    .update({
      estimated_cost_by_hr: parsed.data.estimatedCostByHr,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.requestId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_request_priced", parsed.data.requestId, null, parsed.data);
  return { status: "success" };
}

const recommendationSchema = z.object({
  planId: z.string().uuid(),
  hrRecommendation: z.string().trim().min(1),
});

/** HR's written recommendation on the plan — required before submitting it. */
export async function savePlanHrRecommendation(input: {
  planId: string;
  hrRecommendation: string;
}): Promise<RecruitmentRequestActionState> {
  const parsed = recommendationSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const permissions = await myPermissions(supabase);
  const level = permissions.recruitmentPlan ?? "none";
  if (level !== "recommend" && level !== "approve") {
    return { status: "error", message: "forbidden" };
  }

  const { data: updated, error } = await supabase
    .from("recruitment_plans")
    .update({ hr_recommendation: parsed.data.hrRecommendation })
    .eq("id", parsed.data.planId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_plan_recommendation_saved", parsed.data.planId, null, parsed.data);
  return { status: "success" };
}

/**
 * How many of a plan's requests are still undecided. The plan's final
 * approval is blocked while this is non-zero (the guard's
 * `requiresAllRequestsDecided`), so the approval action and the consolidate
 * screen both read it from here rather than each counting for themselves.
 */
export async function countUndecidedPlanRequests(planId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruitment_requests")
    .select("status")
    .eq("plan_id", planId)
    .is("deleted_at", null);
  return (data ?? []).filter((row) => !isRequestDecided(row.status)).length;
}
