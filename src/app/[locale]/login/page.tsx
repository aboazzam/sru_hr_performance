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
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--background)]"
      dir={getDir(locale)}
    >
      <div className="absolute top-4 left-4">
        <Link
          href="/login"
          locale={otherLocale}
          className="px-4 py-2 rounded-lg border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-medium hover:bg-[var(--color-primary)] hover:text-white transition-colors"
        >
          {otherLocaleLabel}
        </Link>
      </div>

      <div className="w-full max-w-md p-8 rounded-2xl shadow-lg bg-[var(--surface)] border border-[var(--border)]">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/sru-logo.png"
            alt="شعار جامعة سليمان الراجحي"
            width={100}
            height={100}
            className="mb-4"
          />
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">
            {t("title")}
          </h1>
          <p className="text-sm mt-1 opacity-60">{t("subtitle")}</p>
        </div>

        <LoginForm locale={locale} />
      </div>
    </main>
  );
}
