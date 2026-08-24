import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { locales, isLocale, getDir, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/components/LoginForm";
import { LoginArtwork } from "@/components/LoginArtwork";

/**
 * Two columns: the form on one side, an illustrated panel on the other
 * (2026-08-24, following a reference layout the project owner sent).
 *
 * Two things in that reference are deliberately NOT here, because they would
 * be controls that do nothing:
 *
 *  - "Continue with Google". No Google provider is configured for this
 *    project; sign-in is Supabase email/username + password.
 *  - "Get started, it's free" and a sign-up link. Accounts here are created by
 *    HR and sent as an invite (SECURITY_CHECKLIST 1.7 — signup disabled), so
 *    that slot says how to obtain an account instead of offering to create one.
 */
export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "ar";
  const otherLocale = locales.find((l) => l !== locale) ?? locale;
  const otherLocaleLabel = locale === "ar" ? "English" : "العربية";
  const t = await getTranslations("LoginPage");

  return (
    <main className="sru-auth-split" dir={getDir(locale)}>
      <Link href="/login" locale={otherLocale} className="sru-auth-locale">
        {otherLocaleLabel}
      </Link>

      <section className="sru-auth-split-form">
        <div className="sru-auth-split-inner">
          <div className="sru-auth-split-brand">
            <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={85} height={44} priority />
            <span>{t("subtitle")}</span>
          </div>

          <h1>{t("welcomeTitle")}</h1>
          <p className="sru-auth-split-lead">{t("welcomeLead")}</p>

          <LoginForm locale={locale} />

          <p className="sru-auth-split-note">{t("inviteNote")}</p>
        </div>
      </section>

      <aside className="sru-auth-split-art">
        <LoginArtwork />
      </aside>
    </main>
  );
}
