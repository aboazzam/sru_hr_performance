"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid().optional(),
  type: z.enum(["development", "separation"]),
  reasoning: z.string().trim().optional(),
});

export type CreateRecommendationState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Creates a `recommendations` row (2026-07-24) -- covers only the two
 * types with no existing table ('development'/'separation'); promotion and
 * reward recommendations keep using their own established /promotions and
 * /rewards flows. The INSERT goes through the caller's own RLS-respecting
 * client -- real authorization is `recommendations_insert`'s
 * `check_vpra('promotions','recommend', employee's org_unit_id)`, mirroring
 * `enterReward`/`proposePromotion` exactly.
 */
export async function createRecommendation(
  _prevState: CreateRecommendationState,
  formData: FormData
): Promise<CreateRecommendationState> {
  const parsed = createSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId") || undefined,
    type: formData.get("type"),
    reasoning: formData.get("reasoning") || undefined,
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

  const { employeeId, cycleId, type, reasoning } = parsed.data;

  const { data: created, error } = await supabase
    .from("recommendations")
    .insert({
      employee_id: employeeId,
      cycle_id: cycleId ?? null,
      type,
      reasoning: reasoning ?? null,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }
  if (!created) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "recommendation_created",
    entity: "recommendations",
    entity_id: created.id,
    after_data: { employee_id: employeeId, type, cycle_id: cycleId ?? null },
  });

  return { status: "success" };
}

const decisions = ["approved", "rejected"] as const;

export type ReviewRecommendationResult =
  | { status: "success"; newStatus: (typeof decisions)[number] }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "not_found" | "forbidden" | "unknown" };

/**
 * Reviews (approves or rejects) a `recommendations` row, mirroring
 * `reviewReward`/`reviewPromotion` exactly. `approved_by` is set to the
 * caller's own profile id when approving, never taken from the client.
 */
export async function reviewRecommendation(
  recommendationId: string,
  decision: "approved" | "rejected"
): Promise<ReviewRecommendationResult> {
  const parsedId = z.string().uuid().safeParse(recommendationId);
  const parsedDecision = z.enum(decisions).safeParse(decision);
  if (!parsedId.success || !parsedDecision.success) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "unauthenticated" };
  }

  const { data: recommendation } = await supabase
    .from("recommendations")
    .select("id, status")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (!recommendation) {
    return { status: "error", message: "not_found" };
  }

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { data: updated, error } = await supabase
    .from("recommendations")
    .update({
      status: parsedDecision.data,
      approved_by: parsedDecision.data === "approved" ? (myProfile?.id ?? null) : null,
    })
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    return { status: "error", message: "unknown" };
  }
  if (!updated) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "recommendation_reviewed",
    entity: "recommendations",
    entity_id: parsedId.data,
    before_data: { status: recommendation.status },
    after_data: { status: parsedDecision.data },
  });

  return { status: "success", newStatus: parsedDecision.data };
}
