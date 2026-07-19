"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const enterRewardSchema = z.object({
  employeeId: z.string().uuid(),
  cycleId: z.string().uuid(),
  rewardType: z.string().trim().min(1),
  amount: z.coerce.number().min(0).optional(),
});

export type EnterRewardState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `rewards` row (status defaults to 'pending' at the DB level --
 * no documented status vocabulary/review flow exists for rewards, same
 * precedent as `promotions.status`; only entering a reward was asked for
 * here, not building a review/approve action on top) through the caller's
 * own RLS-respecting client -- `rewards_insert` requires
 * `check_vpra('promotions','recommend', <employee's org_unit_id>)`
 * (20260719000006 -- `rewards` reuses the `promotions` process area since
 * CLAUDE.md documents no dedicated one for rewards), held today by
 * `cxo`/`hr_admin`/`manager` (and `ceo`'s `'approve'` clears it too) per
 * the real seeded matrix; every other role gets "forbidden," enforced by
 * Postgres itself. No self-row bypass exists on INSERT -- an employee
 * cannot grant themselves a reward.
 */
export async function enterReward(
  locale: Locale,
  _prevState: EnterRewardState,
  formData: FormData
): Promise<EnterRewardState> {
  const parsed = enterRewardSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
    rewardType: formData.get("rewardType"),
    amount: formData.get("amount") || undefined,
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

  const { employeeId, cycleId, rewardType, amount } = parsed.data;

  const { error } = await supabase.from("rewards").insert({
    employee_id: employeeId,
    cycle_id: cycleId,
    reward_type: rewardType,
    amount: amount ?? null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: "/rewards", locale });
  return null;
}
