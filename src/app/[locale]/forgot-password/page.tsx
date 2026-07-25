import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { isLocale, getDir, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("ForgotPasswordPage");

  return (
    <main className="sru-auth-page" dir={getDir(locale)}>
      <div className="sru-auth-card">
        <div className="sru-auth-brand">
          <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={100} height={52} />
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>

        <ForgotPasswordForm locale={locale} />

        <p className="sru-auth-link-row">
          <Link href="/login">{t("backToLogin")}</Link>
        </p>
      </div>
    </main>
  );
}
