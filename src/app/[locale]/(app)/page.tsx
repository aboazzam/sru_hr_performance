import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations("HomePage");
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-[var(--color-primary)]">
          {t("title")}
        </h1>
        <p className="text-lg text-[var(--foreground)]">{t("subtitle")}</p>
      </div>
    </div>
  );
}
