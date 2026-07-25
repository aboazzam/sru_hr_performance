import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { isLocale, getDir, type Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

/**
 * Sibling to /login and /reset-password (outside the (app)/ route group, no
 * app chrome) — reached either by the forced-first-login redirect in
 * login/actions.ts, or directly by (app)/layout.tsx's own must_change_password
 * check for anyone who navigates straight into the app without going through
 * login again. Unlike /reset-password, there is no hash token to parse: the
 * caller already has a real session (they just signed in with the temporary
 * password), so this just needs an auth check of its own — no (app)/ layout
 * wraps this route to provide one.
 */
export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("ChangePasswordPage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
    return null;
  }

  return (
    <main className="sru-auth-page" dir={getDir(locale)}>
      <div className="sru-auth-card">
        <div className="sru-auth-brand">
          <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={100} height={52} />
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>

        <ChangePasswordForm />
      </div>
    </main>
  );
}
