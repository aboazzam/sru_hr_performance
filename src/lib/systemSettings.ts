import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "Asia/Riyadh";

/**
 * Reads the app-wide display timezone from the `system_settings` singleton
 * (2026-07-26). `system_settings_select`'s RLS requires `systemSettings>=view`
 * (super_admin-only, same narrow tier as `identity`) — a caller without that
 * grant simply gets no row back and falls back to `DEFAULT_TIMEZONE`, which
 * is already the organizationally-correct value, so in practice every page
 * renders correct Saudi times unless/until super_admin explicitly changes
 * it (in which case only super_admin's own view reflects the change — the
 * same accepted trade-off already established for `org_identity`'s colors).
 */
export async function getDisplayTimezone(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("system_settings").select("timezone").maybeSingle();
  return data?.timezone ?? DEFAULT_TIMEZONE;
}
