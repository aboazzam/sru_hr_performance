"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import {
  evaluatePlanTransition,
  isRequestDecided,
  planTransitions,
  type RecruitmentPermissions,
  type TransitionRefusal,
} from "@/lib/recruitmentWorkflow";
import { financeReviewNotification, planTransitionNotification } from "@/lib/notificationTemplates";
import { notify, profilesWithAccess } from "@/lib/notify";
import { computeRecruitmentPlanTotals } from "@/lib/recruitmentPlan";
import { computeBudgetVariance } from "@/lib/recruitmentPlanAnalytics";

export type RecruitmentPlanErrorMessage =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "duplicate"
  | "not_found"
  | "already_posted"
  | "unknown"
  // Refusals raised by the workflow guard, surfaced with their own Arabic
  // messages from `transitionRefusalMessages` rather than a generic error.
  | TransitionRefusal;

export type RecruitmentPlanActionState =
  | { status: "success"; createdCount?: number; skippedCount?: number }
  | { status: "error"; message: RecruitmentPlanErrorMessage };

function mapError(error: { code?: string; message: string }): RecruitmentPlanActionState {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return { status: "error", message: "forbidden" };
  }
  if (error.code === "23505") {
    return { status: "error", message: "duplicate" };
  }
  if (error.code === "23514") {
    return { status: "error", message: "invalid_input" };
  }
  return { status: "error", message: "unknown" };
}

async function auditLog(actorId: string, action: string, entityId: string | null, after: unknown) {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity: "recruitment_plans",
    entity_id: entityId,
    after_data: after as Record<string, unknown>,
  });
}

const createPlanSchema = z.object({
  nameAr: z.string().trim().min(1),
  planYear: z.number().int().min(2020).max(2100),
  notes: z.string().trim().optional(),
});

/**
 * Creates a `recruitment_plans` row (status defaults to 'draft' at the DB
 * level). Real authorization is `recruitment_plans_insert`'s own RLS
 * (`check_vpra_global('recruitmentPlan','prepare')`, hr_admin-only per the
 * seeded matrix), enforced by Postgres through the caller's own client —
 * this action adds no second gate of its own. The one-plan-per-year partial
 * unique index surfaces as a clear "duplicate" message rather than a
 * generic failure.
 */
export async function createRecruitmentPlan(
  nameAr: string,
  planYear: number,
  notes: string
): Promise<RecruitmentPlanActionState> {
  const parsed = createPlanSchema.safeParse({ nameAr, planYear, notes: notes || undefined });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", actor.id)
    .maybeSingle();

  const { data: plan, error } = await supabase
    .from("recruitment_plans")
    .insert({
      name_ar: parsed.data.nameAr,
      plan_year: parsed.data.planYear,
      notes: parsed.data.notes ?? null,
      created_by: profile?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  await auditLog(actor.id, "recruitment_plan_created", plan.id, {
    name_ar: parsed.data.nameAr,
    plan_year: parsed.data.planYear,
  });
  return { status: "success" };
}

const addItemSchema = z.object({
  planId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  jobTitleId: z.string().uuid().optional(),
  headcount: z.number().int().min(1).max(1000),
  targetQuarter: z.number().int().min(1).max(4).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  estimatedMonthlyCost: z.number().min(0).optional(),
  justification: z.string().trim().optional(),
});

/**
 * Adds one planned hire to a plan. When no cost is typed and a job title is
 * chosen, the cost is seeded from that title's real `salary_scale.step_a`
 * (the starting step) rather than left blank — the whole point of the
 * proposal the project owner approved was that the plan reads its numbers
 * from data this database already holds. It is stored, not computed on
 * read, so a later salary-scale revision doesn't silently restate an
 * already-approved plan.
 */
export async function addRecruitmentPlanItem(input: {
  planId: string;
  orgUnitId: string;
  jobTitleId?: string;
  headcount: number;
  targetQuarter?: number;
  priority?: string;
  estimatedMonthlyCost?: number;
  justification?: string;
}): Promise<RecruitmentPlanActionState> {
  const parsed = addItemSchema.safeParse({
    ...input,
    jobTitleId: input.jobTitleId || undefined,
    priority: input.priority || undefined,
    justification: input.justification || undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  let cost = parsed.data.estimatedMonthlyCost ?? null;
  if (cost == null && parsed.data.jobTitleId) {
    const { data: salary } = await supabase
      .from("salary_scale")
      .select("step_a")
      .eq("job_title_id", parsed.data.jobTitleId)
      .maybeSingle();
    cost = salary?.step_a ?? null;
  }

  const { data: item, error } = await supabase
    .from("recruitment_plan_items")
    .insert({
      plan_id: parsed.data.planId,
      org_unit_id: parsed.data.orgUnitId,
      job_title_id: parsed.data.jobTitleId ?? null,
      headcount: parsed.data.headcount,
      target_quarter: parsed.data.targetQuarter ?? null,
      priority: parsed.data.priority ?? null,
      estimated_monthly_cost: cost,
      justification: parsed.data.justification ?? null,
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  await auditLog(actor.id, "recruitment_plan_item_added", parsed.data.planId, { item_id: item.id });
  return { status: "success" };
}

const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  headcount: z.number().int().min(1).max(1000),
  targetQuarter: z.number().int().min(1).max(4).nullable(),
  priority: z.enum(["high", "medium", "low"]).nullable(),
  estimatedMonthlyCost: z.number().min(0).nullable(),
  status: z.enum(["planned", "posted", "filled", "cancelled"]),
  justification: z.string().trim().nullable(),
});

/** Edits one item in place; the edit form always resends every field. */
export async function updateRecruitmentPlanItem(input: {
  itemId: string;
  headcount: number;
  targetQuarter: number | null;
  priority: string | null;
  estimatedMonthlyCost: number | null;
  status: string;
  justification: string | null;
}): Promise<RecruitmentPlanActionState> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: updated, error } = await supabase
    .from("recruitment_plan_items")
    .update({
      headcount: parsed.data.headcount,
      target_quarter: parsed.data.targetQuarter,
      priority: parsed.data.priority,
      estimated_monthly_cost: parsed.data.estimatedMonthlyCost,
      status: parsed.data.status,
      justification: parsed.data.justification,
    })
    .eq("id", parsed.data.itemId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  // RLS denies by returning zero rows on UPDATE, not an error.
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_plan_item_updated", parsed.data.itemId, parsed.data);
  return { status: "success" };
}

/** Soft-delete (CLAUDE.md §5-A rule 7) — never a real DELETE. */
export async function deleteRecruitmentPlanItem(itemId: string): Promise<RecruitmentPlanActionState> {
  if (!z.string().uuid().safeParse(itemId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: deleted, error } = await supabase
    .from("recruitment_plan_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!deleted || deleted.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_plan_item_deleted", itemId, { item_id: itemId });
  return { status: "success" };
}

/**
 * Fills the plan from the org chart: every `org_structure_positions` row
 * that has NO active `org_structure_assignments` row is a genuinely vacant
 * seat (44 of the 49 real positions at the time this was built), and each
 * becomes one planned hire — headcount 1, cost seeded from the position's
 * job title's real `salary_scale.step_a`.
 *
 * Idempotent by construction: positions already present in this plan are
 * skipped in code, and the `(plan_id, position_id)` partial unique index is
 * the real backstop if two people run it at once. Positions with no
 * `org_unit_id` are skipped (the column is NOT NULL on items) — all 44 real
 * ones have a unit today, so this is defensive, and skipped rows are
 * counted back to the caller rather than silently dropped.
 */
export async function importVacantPositionsIntoPlan(
  planId: string
): Promise<RecruitmentPlanActionState> {
  if (!z.string().uuid().safeParse(planId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const [{ data: positions }, { data: assignments }, { data: existingItems }] = await Promise.all([
    supabase
      .from("org_structure_positions")
      .select("id, name_ar, org_unit_id, job_title_id")
      .is("deleted_at", null),
    supabase.from("org_structure_assignments").select("position_id").is("deleted_at", null),
    supabase
      .from("recruitment_plan_items")
      .select("position_id")
      .eq("plan_id", planId)
      .is("deleted_at", null),
  ]);

  const staffed = new Set((assignments ?? []).map((a) => a.position_id));
  const alreadyPlanned = new Set((existingItems ?? []).map((i) => i.position_id).filter(Boolean));

  const vacant = (positions ?? []).filter((p) => !staffed.has(p.id) && !alreadyPlanned.has(p.id));
  const withUnit = vacant.filter((p) => p.org_unit_id);
  const skippedCount = vacant.length - withUnit.length;

  if (withUnit.length === 0) {
    return { status: "success", createdCount: 0, skippedCount };
  }

  const jobTitleIds = [...new Set(withUnit.map((p) => p.job_title_id).filter(Boolean))] as string[];
  const { data: salaries } = jobTitleIds.length
    ? await supabase.from("salary_scale").select("job_title_id, step_a").in("job_title_id", jobTitleIds)
    : { data: [] };
  const stepAByJobTitle = new Map((salaries ?? []).map((s) => [s.job_title_id, s.step_a]));

  const rows = withUnit.map((p) => ({
    plan_id: planId,
    org_unit_id: p.org_unit_id,
    job_title_id: p.job_title_id,
    position_id: p.id,
    headcount: 1,
    estimated_monthly_cost: p.job_title_id ? stepAByJobTitle.get(p.job_title_id) ?? null : null,
  }));

  const { data: inserted, error } = await supabase.from("recruitment_plan_items").insert(rows).select("id");
  if (error) return mapError(error);

  await auditLog(actor.id, "recruitment_plan_positions_imported", planId, {
    created: inserted?.length ?? 0,
    skipped: skippedCount,
  });
  return { status: "success", createdCount: inserted?.length ?? 0, skippedCount };
}

/**
 * Publishes one planned hire as a real `vacancies` posting and links the two
 * (`vacancy_id` + status 'posted'). Deliberately goes through the caller's
 * own client, so `vacancies_insert`'s own `check_vpra('vacancies','approve',
 * org_unit_id)` still decides — a caller who can prepare the plan but can't
 * create postings gets "forbidden" from Postgres, not a bypass. Requirements
 * text is seeded from the job title's own `qualification_required`, the same
 * source the manual create-vacancy form already prefills from.
 */
export async function publishPlanItemAsVacancy(itemId: string): Promise<RecruitmentPlanActionState> {
  if (!z.string().uuid().safeParse(itemId).success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: item } = await supabase
    .from("recruitment_plan_items")
    .select("id, org_unit_id, job_title_id, vacancy_id")
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!item) return { status: "error", message: "not_found" };
  if (item.vacancy_id) return { status: "error", message: "already_posted" };
  // vacancies.job_title_id is NOT NULL — an item with no job title (3 of the
  // real vacant positions) can't become a posting until one is chosen.
  if (!item.job_title_id) return { status: "error", message: "invalid_input" };

  const { data: jobTitle } = await supabase
    .from("job_titles")
    .select("qualification_required")
    .eq("id", item.job_title_id)
    .maybeSingle();

  const { data: vacancy, error } = await supabase
    .from("vacancies")
    .insert({
      job_title_id: item.job_title_id,
      org_unit_id: item.org_unit_id,
      requirements_ar: jobTitle?.qualification_required ?? null,
    })
    .select("id")
    .single();

  if (error) return mapError(error);

  const { error: linkError } = await supabase
    .from("recruitment_plan_items")
    .update({ vacancy_id: vacancy.id, status: "posted" })
    .eq("id", itemId);
  if (linkError) return mapError(linkError);

  await auditLog(actor.id, "recruitment_plan_item_published", itemId, { vacancy_id: vacancy.id });
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Guarded plan workflow (2026-08-07)
// ---------------------------------------------------------------------------
// This REPLACES the original flat `approveRecruitmentPlan`, which set
// `status='approved'` directly after an inline `approve`-level check. That
// was correct while the plan had only draft/approved, but it would now let
// an approver skip the entire documented cycle — approving a plan finance
// never reviewed, or one still holding undecided requests. Approval is now
// one transition among many, and `recruitmentWorkflow.ts` decides all of
// them.

/** The caller's own levels across every area, shaped for the guard. */
async function myPermissions(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<RecruitmentPermissions> {
  const { data } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (data ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  return permissions;
}

const planTransitionSchema = z.object({
  planId: z.string().uuid(),
  toStatus: z.string().min(1),
  note: z.string().trim().optional(),
  financeNote: z.string().trim().optional(),
});

/**
 * The one and only way a plan's status changes. Like the request-side
 * action, the CURRENT status is read here rather than accepted from the
 * client, and the two preconditions the guard cannot see for itself —
 * whether finance has reviewed, and how many of the plan's requests are
 * still undecided — are counted here and handed to it.
 *
 * Note the undecided count is derived from `recruitment_requests` through
 * the caller's own client, so it reflects rows RLS lets them read. An
 * approver who cannot see a request also cannot be blocked by it; that is a
 * deliberate consequence of reading through RLS rather than bypassing it
 * with the service-role client, and it is safe here because every role that
 * reaches `approve` on `recruitmentPlan` holds unscoped visibility.
 */
export async function transitionRecruitmentPlan(input: {
  planId: string;
  toStatus: string;
  note?: string;
  financeNote?: string;
}): Promise<RecruitmentPlanActionState> {
  const parsed = planTransitionSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const { data: plan } = await supabase
    .from("recruitment_plans")
    .select("id, status, finance_reviewed_at, finance_note")
    .eq("id", parsed.data.planId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { status: "error", message: "not_found" };

  const { data: linkedRequests } = await supabase
    .from("recruitment_requests")
    .select("status")
    .eq("plan_id", parsed.data.planId)
    .is("deleted_at", null);
  const undecidedRequestCount = (linkedRequests ?? []).filter(
    (row) => !isRequestDecided(row.status)
  ).length;

  const verdict = evaluatePlanTransition(plan.status, parsed.data.toStatus, {
    permissions: await myPermissions(supabase),
    note: parsed.data.note,
    // A finance note already on record satisfies the rule as well as a
    // freshly typed one — finance must have written one, not written one twice.
    financeNote: parsed.data.financeNote ?? plan.finance_note,
    financeReviewed: plan.finance_reviewed_at !== null,
    undecidedRequestCount,
  });
  if (!verdict.allowed) return { status: "error", message: verdict.refusal };

  const patch: Record<string, unknown> = { status: parsed.data.toStatus };
  if (parsed.data.financeNote) patch.finance_note = parsed.data.financeNote;

  if (parsed.data.toStatus === "submitted") patch.submitted_at = new Date().toISOString();
  if (parsed.data.toStatus === "approved" || parsed.data.toStatus === "rejected") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    patch.approval_note = parsed.data.note ?? null;
    if (parsed.data.toStatus === "approved") {
      patch.approved_by = profile?.id ?? null;
      patch.approved_at = new Date().toISOString();
    }
  }

  const { data: updated, error } = await supabase
    .from("recruitment_plans")
    .update(patch)
    .eq("id", parsed.data.planId)
    // Optimistic concurrency: never overwrite a decision someone else made
    // between our read and this write.
    .eq("status", plan.status)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_plan_transitioned", parsed.data.planId, {
    from: plan.status,
    to: parsed.data.toStatus,
    note: parsed.data.note ?? null,
  });

  // Legacy carry-over only. Since 20260808000003 a request reaches `approved`
  // on its own — the approver rules on it and it is inserted into the plan
  // automatically — and a request still at `hr_reviewed` COUNTS AS UNDECIDED,
  // so `requiresAllRequestsDecided` refuses this very transition while one is
  // on the plan. Approving a plan therefore cannot encounter a live request
  // that still needs deciding; only an `included_in_plan` row left over from
  // the old chain can be here, and this sweeps it up.
  if (parsed.data.toStatus === "approved") {
    await supabase
      .from("recruitment_requests")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("plan_id", parsed.data.planId)
      .eq("status", "included_in_plan")
      .is("deleted_at", null);
  }

  // Whoever can act next, derived from the transition table itself, plus
  // every department that has a request riding on this plan — they are the
  // people whose own request just moved with it.
  try {
    const admin = createAdminClient();
    const { data: planRow } = await supabase
      .from("recruitment_plans")
      .select("name_ar, plan_year")
      .eq("id", parsed.data.planId)
      .maybeSingle();
    const { data: requesters } = await supabase
      .from("recruitment_requests")
      .select("requested_by")
      .eq("plan_id", parsed.data.planId)
      .is("deleted_at", null);

    const nextActors = planTransitions
      .filter((rule) => rule.from === parsed.data.toStatus)
      .map((rule) => rule.requires);

    await notify(
      admin,
      [
        ...(requesters ?? []).map((row) => row.requested_by),
        ...(await profilesWithAccess(admin, nextActors)),
      ],
      planTransitionNotification({
        toStatus: parsed.data.toStatus,
        planName: planRow?.name_ar ?? "",
        planYear: planRow?.plan_year ?? 0,
        planId: parsed.data.planId,
        reason: parsed.data.note,
      }),
      "recruitment_plans",
      parsed.data.planId
    );
  } catch (notifyError) {
    // A notification failure must never undo a transition already audited.
    console.error("plan transition notification failed", notifyError);
  }

  return { status: "success" };
}

const financeReviewSchema = z.object({
  planId: z.string().uuid(),
  approvedBudget: z.number().min(0).nullable(),
  // Mandatory by the spec's own rule: finance takes no action without a note.
  financeNote: z.string().trim().min(1),
});

/**
 * Records the finance review: the approved budget and the mandatory note,
 * stamping `finance_reviewed_at`/`finance_reviewed_by`. That stamp is what
 * the guard's `requiresFinanceReview` reads, so this action is what makes
 * the finance stage genuinely unskippable rather than decorative.
 *
 * Gated on `recruitmentBudget>=recommend`, checked HERE because Postgres
 * policies gate rows, not columns: `recruitment_plans_update` cannot express
 * "only finance may write these particular columns", so without this check a
 * plan preparer could stamp the finance review themselves.
 *
 * That policy admits the finance reviewer through a branch of its own —
 * `recruitmentPlan>=prepare` OR `recruitmentBudget>=recommend`, the second
 * added by 20260807000005 once finance turned out to be able to read the
 * requests but not write the plan it reviews.
 *
 * Worth stating plainly, because this comment used to claim the row gate was
 * `recruitmentPlan>=prepare` alone: the finance manager role holds only
 * `recruitmentPlan=view`, so that OR branch is the ONLY reason their save is
 * accepted. Verified by simulating their session — the first branch returns
 * false, the second true, and the UPDATE affects its row. Drop the branch and
 * the finance stage breaks while every application-level check still passes.
 */
export async function saveFinanceReview(input: {
  planId: string;
  approvedBudget: number | null;
  financeNote: string;
}): Promise<RecruitmentPlanActionState> {
  const parsed = financeReviewSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) return { status: "error", message: "unauthenticated" };

  const permissions = await myPermissions(supabase);
  if (!hasVpraAccess(permissions.recruitmentBudget ?? "none", "recommend")) {
    return { status: "error", message: "forbidden" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", actor.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("recruitment_plans")
    .update({
      approved_budget: parsed.data.approvedBudget,
      finance_note: parsed.data.financeNote,
      finance_reviewed_at: new Date().toISOString(),
      finance_reviewed_by: profile?.id ?? null,
    })
    .eq("id", parsed.data.planId)
    .is("deleted_at", null)
    .select("id");

  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  await auditLog(actor.id, "recruitment_plan_finance_reviewed", parsed.data.planId, {
    approved_budget: parsed.data.approvedBudget,
    finance_note: parsed.data.financeNote,
  });

  // HR (who must react to an over-budget verdict) and the approval authority
  // (who cannot approve until this exists) are the two parties that need to
  // know a review was recorded.
  try {
    const admin = createAdminClient();
    const { data: planRow } = await supabase
      .from("recruitment_plans")
      .select("name_ar, plan_year")
      .eq("id", parsed.data.planId)
      .maybeSingle();
    const { data: itemRows } = await supabase
      .from("recruitment_plan_items")
      .select("headcount, estimated_monthly_cost")
      .eq("plan_id", parsed.data.planId)
      .is("deleted_at", null);

    const totals = computeRecruitmentPlanTotals(
      (itemRows ?? []).map((row) => ({
        headcount: row.headcount,
        estimatedMonthlyCost: row.estimated_monthly_cost,
      }))
    );
    const variance = computeBudgetVariance(totals.totalAnnualCost, parsed.data.approvedBudget);

    await notify(
      admin,
      await profilesWithAccess(admin, [
        { processArea: "recruitmentPlan", minLevel: "recommend" },
        { processArea: "recruitmentPlan", minLevel: "approve" },
      ]),
      financeReviewNotification({
        planName: planRow?.name_ar ?? "",
        planYear: planRow?.plan_year ?? 0,
        planId: parsed.data.planId,
        overBudget: variance.status === "over",
      }),
      "recruitment_plans",
      parsed.data.planId
    );
  } catch (notifyError) {
    console.error("finance review notification failed", notifyError);
  }

  return { status: "success" };
}
