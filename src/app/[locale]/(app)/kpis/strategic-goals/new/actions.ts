"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createStrategicGoalSchema = z.object({
  cycleId: z.string().uuid(),
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  unitAr: z.string().trim().min(1),
  unitEn: z.string().trim().optional(),
  targetValue: z.coerce.number().optional(),
  weight: z.coerce.number().min(0.01).max(100).optional(),
});

export type CreateStrategicGoalState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "identity_incomplete" | "unknown";
    }
  | null;

/**
 * Creates a `strategic_goals` row through the caller's own RLS-respecting
 * client -- `strategic_goals_insert` requires
 * check_vpra_global('strategicPlanning','approve') (20260727000005),
 * strategy_admin-only per the seeded matrix, enforced by Postgres itself.
 */
export async function createStrategicGoal(
  locale: Locale,
  _prevState: CreateStrategicGoalState,
  formData: FormData
): Promise<CreateStrategicGoalState> {
  const parsed = createStrategicGoalSchema.safeParse({
    cycleId: formData.get("cycleId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn") || undefined,
    descriptionAr: formData.get("descriptionAr") || undefined,
    descriptionEn: formData.get("descriptionEn") || undefined,
    unitAr: formData.get("unitAr"),
    unitEn: formData.get("unitEn") || undefined,
    targetValue: formData.get("targetValue") || undefined,
    weight: formData.get("weight") || undefined,
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

  const { cycleId, titleAr, titleEn, descriptionAr, descriptionEn, unitAr, unitEn, targetValue, weight } = parsed.data;

  // Business-rule guard, not a security boundary (the page itself already
  // hides this form when incomplete) — re-checked here per CLAUDE.md §5-A's
  // "never rely on UI-only protection" discipline, same reasoning already
  // applied to the VPRA page-gates on this route.
  const { data: identity } = await supabase.from("strategic_identity").select("vision_ar, mission_ar").maybeSingle();
  const { count: valuesCount } = await supabase
    .from("strategic_values")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const identityComplete = Boolean(identity?.vision_ar?.trim() && identity?.mission_ar?.trim() && (valuesCount ?? 0) > 0);
  if (!identityComplete) {
    return { status: "error", message: "identity_incomplete" };
  }

  // Self-row lookup (profiles_select always allows this regardless of
  // VPRA) — created_by references profiles(id), not auth.users(id).
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { data: goal, error } = await supabase
    .from("strategic_goals")
    .insert({
      cycle_id: cycleId,
      title_ar: titleAr,
      title_en: titleEn || null,
      description_ar: descriptionAr || null,
      description_en: descriptionEn || null,
      unit_ar: unitAr,
      unit_en: unitEn || null,
      target_value: targetValue ?? null,
      weight: weight ?? null,
      created_by: myProfile?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    if (error.code === "23514") {
      return { status: "error", message: "invalid_input" };
    }
    return { status: "error", message: "unknown" };
  }

  redirect({ href: `/kpis/strategic-goals/${goal.id}/sub-goals/new`, locale });
  return null;
}
