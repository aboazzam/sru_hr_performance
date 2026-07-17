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
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--background)]"
      dir={getDir(locale)}
    >
      <div className="w-full max-w-md p-8 rounded-2xl shadow-lg bg-[var(--surface)] border border-[var(--border)]">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/sru-logo.png"
            alt="شعار جامعة سليمان الراجحي"
            width={100}
            height={100}
            className="mb-4"
          />
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">{t("title")}</h1>
          <p className="text-sm mt-1 opacity-60">{t("subtitle")}</p>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
