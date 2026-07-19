"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const decisions = ["approved", "rejected"] as const;

export type ReviewRewardResult =
  | { status: "success"; newStatus: (typeof decisions)[number] }
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "not_found" | "forbidden" | "unknown";
    };

/**
 * Reviews (approves or rejects) a `rewards` row, mirroring
 * `reviewPromotion` exactly. `rewards.status` has no documented
 * vocabulary/state machine -- a flat pending -> approved|rejected
 * decision, same precedent as `promotions.status`.
 *
 * The write goes through the caller's own RLS-respecting client --
 * `rewards_update`'s `check_vpra('promotions','recommend', ...)`
 * (20260719000006 -- `rewards` reuses the `promotions` process area) is
 * the real authorization boundary, held by `cxo`/`hr_admin`/`manager`
 * (and `ceo`'s `'approve'` satisfies it too) per the real seeded matrix.
 * No role-specific gating is layered on top here, same reasoning as
 * `reviewPromotion`: no distinct approval tier is documented for
 * rewards. `approved_by` is set to the caller's own profile id when
 * approving, never taken from the client.
 */
export async function reviewReward(
  rewardId: string,
  decision: "approved" | "rejected"
): Promise<ReviewRewardResult> {
  const parsedId = z.string().uuid().safeParse(rewardId);
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

  const { data: reward } = await supabase
    .from("rewards")
    .select("id, status")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (!reward) {
    return { status: "error", message: "not_found" };
  }

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("rewards")
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
    action: "reward_reviewed",
    entity: "rewards",
    entity_id: parsedId.data,
    before_data: { status: reward.status },
    after_data: { status: parsedDecision.data },
  });

  return { status: "success", newStatus: parsedDecision.data };
}
