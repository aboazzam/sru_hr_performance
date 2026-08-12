import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { isLocale, getDir, type Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { Link, redirect } from "@/i18n/navigation";
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

  // Two very different visits land here now that the user menu links to it:
  //
  //   forced    — signed in with an admin-set temporary password and sent
  //               here by login/actions.ts or (app)/layout.tsx;
  //   voluntary — chose "تغيير كلمة المرور" from their own menu.
  //
  // The original copy ("your account was created with a temporary password")
  // is a plain untruth for the second, and a way out must exist for it — but
  // NOT for the first, where being able to walk away is the whole thing the
  // forced redirect prevents.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const forced = profile?.must_change_password === true;

  return (
    <main className="sru-auth-page" dir={getDir(locale)}>
      <div className="sru-auth-card">
        <div className="sru-auth-brand">
          <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={100} height={52} />
          <h1>{forced ? t("title") : t("voluntaryTitle")}</h1>
          <p>{forced ? t("subtitle") : t("voluntarySubtitle")}</p>
        </div>

        <ChangePasswordForm />

        {!forced && (
          <p style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}>
            <Link href="/">{t("backToApp")}</Link>
          </p>
        )}
      </div>
    </main>
  );
}
