"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/${locale}/reset-password`,
  });

  return { status: "sent" };
}
