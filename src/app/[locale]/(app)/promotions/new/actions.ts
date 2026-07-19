"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const proposePromotionSchema = z
  .object({
    employeeId: z.string().uuid(),
    cycleId: z.string().uuid(),
    fromJobTitleId: z.string().uuid().optional(),
    toJobTitleId: z.string().uuid(),
  })
  .refine((data) => data.fromJobTitleId !== data.toJobTitleId, {
    message: "from and to job title must differ",
  });

export type ProposePromotionState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `promotions` row (status defaults to 'pending' at the DB
 * level -- no documented status vocabulary exists, same precedent as
 * `goals.status`/`calibration_sessions.status`) through the caller's own
 * RLS-respecting client -- `promotions_insert` requires
 * `check_vpra('promotions','recommend', <employee's org_unit_id>)`
 * (20260719000005), held today by `cxo`/`hr_admin`/`manager` (and `ceo`'s
 * `'approve'` automatically clears it too) per the real seeded matrix;
 * every other role gets "forbidden," enforced by Postgres itself. No
 * self-row bypass exists on INSERT -- an employee cannot propose their
 * own promotion.
 */
export async function proposePromotion(
  locale: Locale,
  _prevState: ProposePromotionState,
  formData: FormData
): Promise<ProposePromotionState> {
  const parsed = proposePromotionSchema.safeParse({
    employeeId: formData.get("employeeId"),
    cycleId: formData.get("cycleId"),
    fromJobTitleId: formData.get("fromJobTitleId") || undefined,
    toJobTitleId: formData.get("toJobTitleId"),
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

  const { employeeId, cycleId, fromJobTitleId, toJobTitleId } = parsed.data;

  const { error } = await supabase.from("promotions").insert({
    employee_id: employeeId,
    cycle_id: cycleId,
    from_job_title_id: fromJobTitleId ?? null,
    to_job_title_id: toJobTitleId,
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

  redirect({ href: "/promotions", locale });
  return null;
}
