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
