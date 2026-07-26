"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  timezone: z.string().trim().min(1),
});

export type UpdateSystemSettingsState =
  | { status: "success" }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "forbidden" | "unknown" }
  | null;

/**
 * Updates the singleton `system_settings` row (2026-07-26). The write goes
 * through the caller's own RLS-respecting client -- real authorization is
 * `system_settings_update`'s `check_vpra_global('systemSettings','approve')`,
 * super_admin-only, same pattern as `updateOrgIdentity`. Unlike
 * `org_identity`, this table is seeded with exactly one row by its own
 * migration, so this is always a plain UPDATE, never an insert.
 *
 * `timezone` isn't validated against the real IANA list here (the form's
 * <select> only ever offers values from `Intl.supportedValuesOf("timeZone")`
 * to begin with) -- a malformed value would just fail silently wherever it's
 * later passed to `toLocaleString`'s `timeZone` option, not corrupt anything.
 */
export async function updateSystemSettings(
  _prevState: UpdateSystemSettingsState,
  formData: FormData
): Promise<UpdateSystemSettingsState> {
  const parsed = settingsSchema.safeParse({ timezone: formData.get("timezone") });
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

  const { data: existing } = await supabase.from("system_settings").select("id").maybeSingle();
  if (!existing) {
    return { status: "error", message: "unknown" };
  }

  const { data: written, error } = await supabase
    .from("system_settings")
    .update({ timezone: parsed.data.timezone, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

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
