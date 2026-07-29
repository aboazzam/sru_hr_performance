"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const createSubGoalSchema = z.object({
  strategicGoalId: z.string().uuid(),
  ownerPositionId: z.string().uuid(),
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  weight: z.coerce.number().min(0.01).max(100).optional(),
});

export type CreateSubGoalState =
  | {
      status: "error";
      message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown";
    }
  | null;

/**
 * Creates a `sub_goals` row -- the first cascade of a strategic goal onto
 * an org_structure_positions row (typically C2), through the caller's own
 * RLS-respecting client. `sub_goals_insert` requires
 * check_vpra_global('strategicPlanning','approve') (20260727000005),
 * strategy_admin-only per the seeded matrix -- "مدير الاستراتيجية...
 * المسؤول عن اسقاط الأهداف الفرعية" -- enforced by Postgres itself.
 */
export async function createSubGoal(
  locale: Locale,
  _prevState: CreateSubGoalState,
  formData: FormData
): Promise<CreateSubGoalState> {
  const parsed = createSubGoalSchema.safeParse({
    strategicGoalId: formData.get("strategicGoalId"),
    ownerPositionId: formData.get("ownerPositionId"),
    titleAr: formData.get("titleAr"),
    titleEn: formData.get("titleEn") || undefined,
    descriptionAr: formData.get("descriptionAr") || undefined,
    descriptionEn: formData.get("descriptionEn") || undefined,
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

  const { strategicGoalId, ownerPositionId, titleAr, titleEn, descriptionAr, descriptionEn, weight } = parsed.data;

  // Self-row lookup (profiles_select always allows this regardless of
  // VPRA) — created_by references profiles(id), not auth.users(id).
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { error } = await supabase.from("sub_goals").insert({
    strategic_goal_id: strategicGoalId,
    owner_position_id: ownerPositionId,
    title_ar: titleAr,
    title_en: titleEn || null,
    description_ar: descriptionAr || null,
    description_en: descriptionEn || null,
    created_by: myProfile?.id ?? null,
    weight: weight ?? null,
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

  redirect({ href: "/kpis/strategic-goals", locale });
  return null;
}
