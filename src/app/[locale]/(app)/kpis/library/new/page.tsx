import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewKpiLibraryForm } from "@/components/NewKpiLibraryForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function NewKpiLibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("NewKpiLibraryPage");
  const supabase = await createClient();

  // RLS-scoped to the caller, same "seeing an option here doesn't guarantee
  // the insert succeeds" caveat as every other create screen.
  const { data: orgUnits } = await supabase.from("org_units").select("id, name_ar").order("name_ar");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <NewKpiLibraryForm locale={locale} orgUnits={orgUnits ?? []} />
    </div>
  );
}
