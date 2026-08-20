"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActivityActionState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v));

const saveSchema = z
  .object({
    activityId: z.string().uuid().optional(),
    initiativeId: z.string().uuid(),
    titleAr: z.string().trim().min(1),
    responsibleProfileId: z.string().uuid().optional(),
    responsibleName: z.string().trim().optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { path: ["endDate"] })
  // Mirrors initiative_activities_responsible_shape: an employee OR a written
  // name, never both. Neither is fine — an activity may precede its owner.
  .refine((d) => !(d.responsibleProfileId && d.responsibleName), { path: ["responsibleName"] });

function mapError(error: { code?: string; message?: string } | null): ActivityActionState {
  if (!error) return { status: "success" };
  if (error.code === "42501" || error.message?.includes("row-level security")) return { status: "error", message: "forbidden" };
  if (error.code === "23514") return { status: "error", message: "invalid_input" };
  return { status: "error", message: "unknown" };
}

/**
 * Creates or updates one activity row on an initiative's card.
 *
 * Real authorization is initiative_activities' own RLS (20260820000006):
 * strategicPlanning='approve' OR membership of the initiative's OWNING
 * department — the department's own staff maintain the activities they are
 * committing to. An UPDATE blocked by RLS affects zero rows WITHOUT erroring,
 * so the affected rows are read back rather than assumed.
 */
export async function saveInitiativeActivity(_prev: ActivityActionState, formData: FormData): Promise<ActivityActionState> {
  const parsed = saveSchema.safeParse({
    activityId: formData.get("activityId") || undefined,
    initiativeId: formData.get("initiativeId"),
    titleAr: formData.get("titleAr"),
    responsibleProfileId: formData.get("responsibleProfileId") || undefined,
    responsibleName: formData.get("responsibleName") || undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };
  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const d = parsed.data;
  const payload = {
    title_ar: d.titleAr,
    responsible_profile_id: d.responsibleProfileId ?? null,
    responsible_name: d.responsibleName ?? null,
    start_date: d.startDate ?? null,
    end_date: d.endDate ?? null,
  };

  if (d.activityId) {
    const { data: updated, error } = await supabase
      .from("initiative_activities")
      .update(payload)
      .eq("id", d.activityId)
      .is("deleted_at", null)
      .select("id");
    if (error) return mapError(error);
    if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };
  } else {
    // New activities go to the end of the card's list.
    const { data: last } = await supabase
      .from("initiative_activities")
      .select("display_order")
      .eq("initiative_id", d.initiativeId)
      .is("deleted_at", null)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((last?.display_order as number | undefined) ?? 0) + 1;

    const { error } = await supabase.from("initiative_activities").insert({
      ...payload,
      initiative_id: d.initiativeId,
      display_order: nextOrder,
      created_by: myProfile?.id ?? null,
    });
    if (error) return mapError(error);
  }

  revalidatePath("/[locale]/initiatives/[id]", "page");
  return { status: "success" };
}

const deleteSchema = z.object({ activityId: z.string().uuid() });

export async function deleteInitiativeActivity(_prev: ActivityActionState, formData: FormData): Promise<ActivityActionState> {
  const parsed = deleteSchema.safeParse({ activityId: formData.get("activityId") });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  // Soft-delete: the table has no DELETE policy at all.
  const { data: updated, error } = await supabase
    .from("initiative_activities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.activityId)
    .is("deleted_at", null)
    .select("id");
  if (error) return mapError(error);
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/initiatives/[id]", "page");
  return { status: "success" };
}

export type InitiativeCardState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "duplicate_code" | "unknown" }
  | null;

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalUuid = optionalText.refine(
  (v) => v === undefined || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
);

/**
 * The card fields, all optional except the two the table itself declares NOT
 * NULL (title_ar, status_code).
 *
 * This is DELIBERATELY looser than the two add-initiative forms, which demand
 * every field (2026-08-20). Those records are created in one sitting; this
 * screen exists to complete initiatives entered BEFORE that rule, and
 * refusing a partial save would mean an old card could not be improved at all
 * until every blank was filled at once. `missingInitiativeFields` keeps what
 * is still blank visible on the screen instead.
 */
const cardSchema = z
  .object({
    initiativeId: z.string().uuid(),
    titleAr: z.string().trim().min(1),
    statusCode: z.string().trim().min(1),
    titleEn: optionalText,
    code: optionalText,
    deliverableAr: optionalText,
    descriptionAr: optionalText,
    horizon: optionalText,
    budgetNote: optionalText,
    subGoalId: optionalUuid,
    ownerOrgUnitId: optionalUuid,
    startDate: optionalDate,
    endDate: optionalDate,
    // Reported completion (20260820000008). Optional: an initiative that has
    // not been assessed keeps NULL, and the ring then shows elapsed time
    // instead of claiming 0% done.
    progressPercent: optionalText.refine(
      (v) => v === undefined || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100)
    ),
  })
  // Mirrors the DB's own strategic_initiatives_dates_valid CHECK.
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { path: ["endDate"] });

/**
 * Saves the initiative's own card fields.
 *
 * Real authorization is strategic_initiatives_update (20260819000001):
 * check_vpra_global('strategicPlanning','approve'). The write goes through
 * the caller's own client, and an UPDATE blocked by RLS affects zero rows
 * WITHOUT erroring, so the affected rows are read back rather than assumed.
 */
export async function updateInitiativeCard(_prev: InitiativeCardState, formData: FormData): Promise<InitiativeCardState> {
  const parsed = cardSchema.safeParse({
    initiativeId: formData.get("initiativeId"),
    titleAr: formData.get("titleAr"),
    statusCode: formData.get("statusCode"),
    titleEn: formData.get("titleEn") ?? undefined,
    code: formData.get("code") ?? undefined,
    deliverableAr: formData.get("deliverableAr") ?? undefined,
    descriptionAr: formData.get("descriptionAr") ?? undefined,
    horizon: formData.get("horizon") ?? undefined,
    budgetNote: formData.get("budgetNote") ?? undefined,
    subGoalId: formData.get("subGoalId") ?? undefined,
    ownerOrgUnitId: formData.get("ownerOrgUnitId") ?? undefined,
    startDate: formData.get("startDate") ?? undefined,
    endDate: formData.get("endDate") ?? undefined,
    progressPercent: formData.get("progressPercent") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const d = parsed.data;
  // `?? null` throughout, so clearing a field really clears it rather than
  // silently keeping the old value.
  const { data: updated, error } = await supabase
    .from("strategic_initiatives")
    .update({
      title_ar: d.titleAr,
      title_en: d.titleEn ?? null,
      code: d.code ?? null,
      deliverable_ar: d.deliverableAr ?? null,
      description_ar: d.descriptionAr ?? null,
      horizon: d.horizon ?? null,
      budget_note: d.budgetNote ?? null,
      sub_goal_id: d.subGoalId ?? null,
      owner_org_unit_id: d.ownerOrgUnitId ?? null,
      status_code: d.statusCode,
      start_date: d.startDate ?? null,
      end_date: d.endDate ?? null,
      progress_percent: d.progressPercent === undefined ? null : Number(d.progressPercent),
    })
    .eq("id", d.initiativeId)
    .is("deleted_at", null)
    .select("id");
  if (error) {
    if (error.code === "23505") return { status: "error", message: "duplicate_code" };
    return mapError(error) as InitiativeCardState;
  }
  if (!updated || updated.length === 0) return { status: "error", message: "forbidden" };

  revalidatePath("/[locale]/initiatives/[id]", "page");
  return { status: "success" };
}
