import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { locales, isLocale, getDir, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/components/LoginForm";

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
    <main className="sru-auth-page" dir={getDir(locale)}>
      <Link href="/login" locale={otherLocale} className="sru-auth-locale">
        {otherLocaleLabel}
      </Link>

      <div className="sru-auth-card">
        <div className="sru-auth-brand">
          <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={100} height={52} />
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>

        <LoginForm locale={locale} />
      </div>
    </main>
  );
}
