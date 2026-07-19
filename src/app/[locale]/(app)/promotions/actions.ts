"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const decisions = ["approved", "rejected"] as const;

export type ReviewPromotionResult =
  | { status: "success"; newStatus: (typeof decisions)[number] }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "not_found" | "forbidden" | "unknown";
    };

/**
 * Reviews (approves or rejects) a `promotions` row. `promotions.status`
 * has no documented vocabulary/state machine (unlike `evaluations.state`'s
 * §4-A table) -- this is a flat pending -> approved|rejected decision,
 * not a multi-step lifecycle, matching the "no fixed vocabulary" precedent
 * already established for `goals`/`bau_tasks`/`calibration_sessions`.
 *
 * The write goes through the caller's own RLS-respecting client --
 * `promotions_update`'s `check_vpra('promotions','recommend', ...)`
 * (20260719000005) is the real authorization boundary, held by
 * `cxo`/`hr_admin`/`manager` (and `ceo`'s `'approve'` satisfies it too)
 * per the real seeded matrix. No role-specific gating is layered on top
 * here (e.g. requiring `ceo` specifically for the final decision) --
 * CLAUDE.md/SRU_System_Design.md document no such distinct approval tier
 * for promotions the way §4-A does for evaluations, so none is invented.
 * `approved_by` is set to the caller's own profile id when approving,
 * never taken from the client.
 */
export async function reviewPromotion(
  promotionId: string,
  decision: "approved" | "rejected"
): Promise<ReviewPromotionResult> {
  const parsedId = z.string().uuid().safeParse(promotionId);
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

  const { data: promotion } = await supabase
    .from("promotions")
    .select("id, status")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (!promotion) {
    return { status: "error", message: "not_found" };
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("promotions")
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

  // 0 rows affected means RLS blocked the write — not a success.
  if (!updated) {
    return { status: "error", message: "forbidden" };
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "promotion_reviewed",
    entity: "promotions",
    entity_id: parsedId.data,
    before_data: { status: promotion.status },
    after_data: { status: parsedDecision.data },
  });

  return { status: "success", newStatus: parsedDecision.data };
}
