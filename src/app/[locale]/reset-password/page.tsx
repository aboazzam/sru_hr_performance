import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { isLocale, getDir, type Locale } from "@/i18n/config";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("ResetPasswordPage");

  return (
    <main className="sru-auth-page" dir={getDir(locale)}>
      <div className="sru-auth-card">
        <div className="sru-auth-brand">
          <Image src="/sru-logo.png" alt="شعار جامعة سليمان الراجحي" width={100} height={52} />
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
