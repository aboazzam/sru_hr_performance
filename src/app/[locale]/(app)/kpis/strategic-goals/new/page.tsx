import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewStrategicGoalForm } from "@/components/NewStrategicGoalForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — the real gate is
// strategic_goals_insert's own RLS (strategy_admin only).
export default async function NewStrategicGoalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewStrategicGoalPage");
  const supabase = await createClient();

  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewStrategicGoalForm locale={locale} cycles={cycles ?? []} />
    </div>
  );
}
