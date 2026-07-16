"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/config";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginState = { error: "invalid_input" | "invalid_credentials" | "rate_limited" } | null;

/**
 * Server Action for the login form. `locale` is bound client-side
 * (`login.bind(null, locale)`) so the post-login redirect keeps the
 * current locale prefix. Auth failures resolve to one generic
 * "invalid_credentials" state regardless of whether the email or the
 * password was wrong, to avoid leaking which part of the pair was
 * incorrect (standard practice — CLAUDE.md §5's least-privilege spirit
 * applies to error messages too, not just data access).
 *
 * Rate limited two ways (CLAUDE.md §5-A) before ever calling Supabase Auth:
 * per email (5/15min — the direct brute-force-one-account defense) and per
 * client IP (20/15min — looser, since a shared NAT/proxy IP can carry many
 * legitimate users; catches credential-stuffing across many emails from one
 * source). `x-forwarded-for` is best-effort and trusts the deployment's own
 * proxy/CDN to set it honestly — falls back to a constant bucket if absent
 * (e.g. local dev), which degrades to "one shared IP bucket for everyone"
 * rather than no protection at all.
 */
export async function login(
  locale: Locale,
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "invalid_input" };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const [emailOk, ipOk] = await Promise.all([
    checkRateLimit(`login:email:${parsed.data.email}`, 5, 15 * 60),
    checkRateLimit(`login:ip:${ip}`, 20, 15 * 60),
  ]);

  if (!emailOk || !ipOk) {
    return { error: "rate_limited" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "invalid_credentials" };
  }

  return redirect({ href: "/", locale });
}
