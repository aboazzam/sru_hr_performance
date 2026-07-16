import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely. NEVER import this
 * from a Client Component or expose its result to the browser (CLAUDE.md
 * §5-A #8 / SRU_System_Design.md §C: "service_role key يُستخدم فقط داخل
 * Server Action"). The `server-only` import makes any accidental client
 * bundle inclusion a build error rather than a silent key leak.
 *
 * Use only for operations `authenticated` genuinely cannot do under RLS —
 * today, that's the Admin Auth API (`auth.admin.*`, e.g. inviteUserByEmail)
 * and writing to audit_log (which has no INSERT policy for `authenticated`
 * by design). Do not reach for this to "work around" an RLS policy on
 * ordinary business tables — fix the policy or the caller's role instead.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
