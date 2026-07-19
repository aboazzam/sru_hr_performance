import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateVacancyForm } from "@/components/CreateVacancyForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function CreateVacancyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("CreateVacancyPage");
  const supabase = await createClient();

  // RLS-scoped to the caller, same "seeing an option here doesn't
  // guarantee the insert succeeds" caveat as every other create screen —
  // the real authorization boundary is vacancies_insert's own RLS.
  const { data: jobTitles } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level")
    .is("deleted_at", null)
    .order("grade_level");

  const { data: orgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .order("name_ar");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {jobTitles && jobTitles.length > 0 && orgUnits && orgUnits.length > 0 ? (
        <CreateVacancyForm locale={locale} jobTitles={jobTitles} orgUnits={orgUnits} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
