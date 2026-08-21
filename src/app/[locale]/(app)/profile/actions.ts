"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProfileActionState = { status: "success" } | { status: "error"; message: "invalid_input" | "unauthenticated" | "unknown" } | null;

const schema = z.object({
  certificates: z.string().max(4000),
});

/**
 * The employee maintains their own certificates.
 *
 * The write goes through `update_my_certificates()` (20260821000002), which
 * finds the row by `auth.uid()` and touches that one column — so this action
 * never sends a profile id and cannot be pointed at anyone else's row, and it
 * does not need the `employeeData` grant that `profiles_update` requires (a
 * plain employee holds none).
 */
export async function updateMyCertificates(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const parsed = schema.safeParse({ certificates: formData.get("certificates") ?? "" });
  if (!parsed.success) return { status: "error", message: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const { error } = await supabase.rpc("update_my_certificates", { p_certificates: parsed.data.certificates });
  if (error) return { status: "error", message: "unknown" };

  // Audit-logged like every other write to a profile: the row belongs to the
  // caller, but it is still employee master data.
  try {
    const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    await createAdminClient()
      .from("audit_log")
      .insert({
        actor_id: user.id,
        action: "profile_certificates_updated",
        entity: "profiles",
        entity_id: profile?.id ?? null,
        after_data: { certificates: parsed.data.certificates },
      });
  } catch {
    // A failed audit write must not fail the user's own save.
  }

  revalidatePath("/[locale]/profile", "page");
  return { status: "success" };
}
