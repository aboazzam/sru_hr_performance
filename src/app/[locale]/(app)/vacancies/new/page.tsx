import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateVacancyForm } from "@/components/CreateVacancyForm";
import { isLocale } from "@/i18n/config";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// vacancies_insert's own RLS requires check_vpra('vacancies','approve',
// org_unit_id) — hr_admin-only per the seeded matrix, even though
// `vacancies` itself is intentionally view-able by all staff. This form was
// previously reachable and fully renderable by any authenticated user (same
// bug class found in the audit that fixed kpis/strategic-goals). Gated here
// at the flat `vacancies>=approve` bar as a page-level pre-check; the real
// per-org-unit boundary stays vacancies_insert's own RLS.
export default async function CreateVacancyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("CreateVacancyPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const vacanciesLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "vacancies"
    )?.vpra_level ?? "none";
  const canCreate = hasVpraAccess(vacanciesLevel, "approve");

  if (!canCreate) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

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
