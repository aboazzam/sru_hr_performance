"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type StrategicIdentityErrorMessage = "invalid_input" | "unauthenticated" | "forbidden" | "unknown";

export type UpdateStrategicIdentityState =
  | { status: "success" }
  | { status: "error"; message: StrategicIdentityErrorMessage }
  | null;

export type StrategicValueActionState = { status: "success" } | { status: "error"; message: StrategicIdentityErrorMessage };

function mapError(error: { code?: string; message: string }): StrategicIdentityErrorMessage {
  if (error.code === "42501" || error.message.includes("row-level security")) {
    return "forbidden";
  }
  if (error.code === "23514" || error.code === "23502") {
    return "invalid_input";
  }
  return "unknown";
}

const identitySchema = z.object({
  visionAr: z.string().trim().optional(),
  visionEn: z.string().trim().optional(),
  missionAr: z.string().trim().optional(),
  missionEn: z.string().trim().optional(),
});

/**
 * Upserts the singleton `strategic_identity` row -- mirrors
 * `updateOrgIdentity`'s exact find-or-create pattern (20260724000006).
 * Real authorization is `strategic_identity_insert`/`_update`'s own
 * `check_vpra_global('strategicPlanning','approve')` (20260728000002),
 * strategy_admin-only per the seeded matrix.
 */
export async function updateStrategicIdentity(
  _prevState: UpdateStrategicIdentityState,
  formData: FormData
): Promise<UpdateStrategicIdentityState> {
  const parsed = identitySchema.safeParse({
    visionAr: formData.get("visionAr") || undefined,
    visionEn: formData.get("visionEn") || undefined,
    missionAr: formData.get("missionAr") || undefined,
    missionEn: formData.get("missionEn") || undefined,
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

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { visionAr, visionEn, missionAr, missionEn } = parsed.data;
  const values = {
    vision_ar: visionAr ?? null,
    vision_en: visionEn ?? null,
    mission_ar: missionAr ?? null,
    mission_en: missionEn ?? null,
    updated_by: myProfile?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from("strategic_identity").select("id").maybeSingle();

  const { data: written, error } = existing
    ? await supabase.from("strategic_identity").update(values).eq("id", existing.id).select("id").maybeSingle()
    : await supabase.from("strategic_identity").insert(values).select("id").maybeSingle();

  if (error) {
    return { status: "error", message: mapError(error) };
  }
  // A blocked UPDATE affects 0 rows without erroring -- not a success.
  if (!written) {
    return { status: "error", message: "forbidden" };
  }

  return { status: "success" };
}

const valueSchema = z.object({
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
});

/**
 * Appends a new `strategic_values` row at the end of the existing sequence
 * (display_order = current max + 1) -- same "insert one after another, no
 * mid-list insert UI" convention as `addLevel`/org_structure_levels.
 */
export async function addStrategicValue(titleAr: string, titleEn: string, descriptionAr: string): Promise<StrategicValueActionState> {
  const parsed = valueSchema.safeParse({ titleAr, titleEn: titleEn || undefined, descriptionAr: descriptionAr || undefined });
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

  const { data: myProfile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();

  const { data: maxRow } = await supabase
    .from("strategic_values")
    .select("display_order")
    .is("deleted_at", null)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? 0) + 1;

  const { error } = await supabase.from("strategic_values").insert({
    title_ar: parsed.data.titleAr,
    title_en: parsed.data.titleEn ?? null,
    description_ar: parsed.data.descriptionAr ?? null,
    display_order: nextOrder,
    created_by: myProfile?.id ?? null,
  });

  if (error) {
    return { status: "error", message: mapError(error) };
  }
  return { status: "success" };
}

const updateValueSchema = z.object({
  valueId: z.string().uuid(),
  titleAr: z.string().trim().min(1),
  titleEn: z.string().trim().optional(),
  descriptionAr: z.string().trim().optional(),
});

export async function updateStrategicValue(
  valueId: string,
  titleAr: string,
  titleEn: string,
  descriptionAr: string
): Promise<StrategicValueActionState> {
  const parsed = updateValueSchema.safeParse({ valueId, titleAr, titleEn: titleEn || undefined, descriptionAr: descriptionAr || undefined });
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

  const { error } = await supabase
    .from("strategic_values")
    .update({
      title_ar: parsed.data.titleAr,
      title_en: parsed.data.titleEn ?? null,
      description_ar: parsed.data.descriptionAr ?? null,
    })
    .eq("id", parsed.data.valueId);

  if (error) {
    return { status: "error", message: mapError(error) };
  }
  return { status: "success" };
}

/** Soft-delete via UPDATE (deleted_at = now()) -- no DELETE RLS policy exists, same convention as org_structure_levels/positions. */
export async function deleteStrategicValue(valueId: string): Promise<StrategicValueActionState> {
  const parsed = z.string().uuid().safeParse(valueId);
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

  const { error } = await supabase.from("strategic_values").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data);

  if (error) {
    return { status: "error", message: mapError(error) };
  }
  return { status: "success" };
}
