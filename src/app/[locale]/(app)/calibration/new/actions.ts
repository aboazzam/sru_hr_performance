"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createCalibrationSessionSchema = z.object({
  cycleId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateCalibrationSessionState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `calibration_sessions` row (mode defaults to 'guided' at the
 * DB level -- the sole value CLAUDE.md/SRU_System_Design.md's confirmed
 * decision allows; status defaults to 'draft', no documented vocabulary
 * to advance it from here yet) through the caller's own RLS-respecting
 * client -- `calibration_sessions_insert` requires
 * `check_vpra('calibration','approve', orgUnitId)` (20260719000004), which
 * only `hr_admin` holds today per the real seeded role_permissions
 * matrix; every other role gets "forbidden," enforced by Postgres itself.
 */
export async function createCalibrationSession(
  locale: Locale,
  _prevState: CreateCalibrationSessionState,
  formData: FormData
): Promise<CreateCalibrationSessionState> {
  const parsed = createCalibrationSessionSchema.safeParse({
    cycleId: formData.get("cycleId"),
    orgUnitId: formData.get("orgUnitId"),
    notes: formData.get("notes") || undefined,
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

  const { cycleId, orgUnitId, notes } = parsed.data;

  const { error } = await supabase.from("calibration_sessions").insert({
    cycle_id: cycleId,
    org_unit_id: orgUnitId,
    notes: notes || null,
  });

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: "/calibration", locale });
  return null;
}
