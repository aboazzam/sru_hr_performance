"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/);

const identitySchema = z.object({
  logoUrl: z.string().trim().url().optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
});

export type UpdateIdentityState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Upserts the singleton `org_identity` row (2026-07-24). The write goes
 * through the caller's own RLS-respecting client -- real authorization is
 * `org_identity_update`/`org_identity_insert`'s own
 * `check_vpra_global('orgStructure','approve')`, super_admin-only per the
 * seeded matrix now that hr_admin holds only 'recommend' there
 * (20260724000004). Deliberately no `.select().single()` assumption about
 * an existing row: find-or-create, since this table starts genuinely empty.
 */
export async function updateOrgIdentity(_prevState: UpdateIdentityState, formData: FormData): Promise<UpdateIdentityState> {
  const parsed = identitySchema.safeParse({
    logoUrl: formData.get("logoUrl") || undefined,
    primaryColor: formData.get("primaryColor") || undefined,
    secondaryColor: formData.get("secondaryColor") || undefined,
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

  const { logoUrl, primaryColor, secondaryColor } = parsed.data;

  const { data: existing } = await supabase.from("org_identity").select("id").maybeSingle();

  const values = {
    logo_url: logoUrl ?? null,
    primary_color: primaryColor ?? null,
    secondary_color: secondaryColor ?? null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data: written, error } = existing
    ? await supabase.from("org_identity").update(values).eq("id", existing.id).select("id").maybeSingle()
    : await supabase.from("org_identity").insert(values).select("id").maybeSingle();

  if (error) {
    if (error.code === "42501" || error.message.includes("row-level security")) {
      return { status: "error", message: "forbidden" };
    }
    return { status: "error", message: "unknown" };
  }

  // A blocked UPDATE affects 0 rows without erroring — not a success.
  if (!written) {
    return { status: "error", message: "forbidden" };
  }

  return { status: "success" };
}
