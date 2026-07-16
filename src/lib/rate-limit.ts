import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Postgres-backed rate limiter — see check_rate_limit() in
 * supabase/migrations/20260716000011_rate_limiting.sql for the full
 * rationale (no Upstash/Redis account exists for this project; correct for
 * a single-instance deployment, not strictly race-free across concurrent
 * serverless instances).
 *
 * Always called through the service_role (admin) client — the function
 * itself has no EXECUTE grant for `anon`/`authenticated`, by design.
 *
 * Fails OPEN (returns true, i.e. allow) if the RPC call errors, logging the
 * failure — a bug or outage in this defense-in-depth control should not
 * itself take down login/invite. RLS + VPRA remain the real authorization
 * boundary regardless of this check's outcome.
 */
export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("check_rate_limit RPC failed, failing open:", error);
    return true;
  }

  return data as boolean;
}
