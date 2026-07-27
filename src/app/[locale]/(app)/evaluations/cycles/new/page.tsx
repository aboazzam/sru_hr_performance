import { getTranslations } from "next-intl/server";
import { NewEvaluationCycleForm } from "@/components/NewEvaluationCycleForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — the real gate is
// evaluation_cycles_insert's own RLS (check_vpra_global('evaluation','approve'), hr_admin-only).
export default async function NewEvaluationCyclePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewEvaluationCyclePage");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewEvaluationCycleForm locale={locale} />
    </div>
  );
}
