"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "invalid_credentials" };
  }

  // Real feedback (2026-07-25): CLAUDE.md §5-A rule 5.1 has always required
  // audit_log to capture logins, but nothing in this codebase ever wrote one
  // -- confirmed via a direct search before building the "أنشطة المستخدمين"
  // admin tab that needs this data. A failed audit write must never block a
  // legitimate login, so its result is deliberately not checked here. Logged
  // unconditionally, before the must_change_password branch below — a login
  // is a login regardless of what happens right after it.
  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: signInData.user.id, action: "login", entity: "auth" });

  // 2026-07-25: accounts created directly (no invite email — see
  // employees/new/actions.ts's mode='direct') carry an admin-set or
  // system-suggested password and must be forced to pick their own before
  // reaching the app, entirely in-app, with no recovery-email round trip
  // ("يطلب منه ادخال رقم سري جديد بدون الرجوع للبريد الالكتروني"). Checked
  // via the caller's own RLS-respecting client — profiles_select's self-row
  // bypass already allows this regardless of any employeeData grant.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("auth_user_id", signInData.user.id)
    .maybeSingle();

  if (profile?.must_change_password) {
    return redirect({ href: "/change-password", locale });
  }

  return redirect({ href: "/", locale });
}
