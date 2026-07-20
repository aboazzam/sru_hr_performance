"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Locale } from "@/i18n/config";

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export type ForgotPasswordState =
  | { status: "sent" }
  | { status: "error"; error: "invalid_input" | "rate_limited" }
  | null;

/**
 * Server Action for the "forgot password" form. Closes the gap that caused
 * a real production incident: every password reset until now was triggered
 * manually from the Supabase Dashboard, which redirects using the project's
 * configured Auth "Site URL" rather than any `redirectTo` the app controls —
 * for this project that Site URL doesn't point at `/reset-password`, so the
 * recovery link landed the user on the home page with an unconsumed token
 * instead of the reset form. Calling `resetPasswordForEmail` from here with
 * an explicit `redirectTo` makes the destination correct regardless of that
 * Dashboard setting.
 *
 * Always resolves to the same `{ status: "sent" }` result once past
 * validation/rate-limiting, whether or not the email actually belongs to a
 * real account or Supabase itself returned an error — revealing account
 * existence through this form's response would be a real email-enumeration
 * leak, the same "one generic outcome" precedent `login`'s own
 * `invalid_credentials` state already follows.
 *
 * Rate limited by email (3/15min — stricter than login's 5, since this
 * triggers an actual email send) and by IP (10/15min), same
 * `x-forwarded-for`-trusting, fail-open-on-RPC-error posture as `login`.
 *
 * Deliberately does NOT use `@/lib/supabase/server`'s `createClient()` here
 * — that goes through `@supabase/ssr`'s `createServerClient`, which (like
 * its `createBrowserClient` sibling) unconditionally hardcodes
 * `flowType: "pkce"`, discarding any override. A real production incident
 * traced this exactly: `resetPasswordForEmail` called through that client
 * generates a `pkce_`-prefixed recovery token, whose completion requires a
 * `code_verifier` stored as a cookie on OUR OWN domain — but the resulting
 * email link points at `supabase.co/auth/v1/verify`, a completely
 * different domain that can never receive that cookie. The link fails with
 * `otp_expired` even on a genuine, immediate first click, with no email
 * scanner or timing issue involved at all — confirmed by curl-testing a
 * freshly generated real link the moment it was issued. Using a plain
 * `@supabase/supabase-js` client instead (bypassing `@supabase/ssr`
 * entirely) is the fix: its own default `flowType` is `"implicit"`, which
 * is what recovery-by-email fundamentally needs (no code_verifier/cookie
 * pairing at all -- the session tokens travel in the URL hash instead,
 * exactly what `ResetPasswordForm`'s `setSession()`-based handling already
 * expects). No session/cookie handling is needed for this one-shot,
 * unauthenticated call anyway, so bypassing `@supabase/ssr` here costs
 * nothing.
 */
export async function requestPasswordReset(
  locale: Locale,
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { status: "error", error: "invalid_input" };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const [emailOk, ipOk] = await Promise.all([
    checkRateLimit(`forgot_password:email:${parsed.data.email}`, 3, 15 * 60),
    checkRateLimit(`forgot_password:ip:${ip}`, 10, 15 * 60),
  ]);

  if (!emailOk || !ipOk) {
    return { status: "error", error: "rate_limited" };
  }

  // No NEXT_PUBLIC_SITE_URL exists in this project — derived from the
  // request itself, trusting the deployment's own reverse proxy to set
  // these forwarded headers honestly, same trust boundary as
  // `x-forwarded-for` above.
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto =
    requestHeaders.get("x-forwarded-proto") ?? (forwardedHost?.startsWith("localhost") ? "http" : "https");
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";

  const supabase = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } }
  );
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/${locale}/reset-password`,
  });

  return { status: "sent" };
}
