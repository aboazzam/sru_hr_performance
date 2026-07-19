import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateCalibrationSessionForm } from "@/components/CreateCalibrationSessionForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function CreateCalibrationSessionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("CreateCalibrationSessionPage");
  const supabase = await createClient();

  // RLS-scoped to the caller, same reasoning as the goals/evaluations
  // "create" screens: seeing a cycle/org unit here doesn't guarantee the
  // insert below will succeed — the real authorization boundary is
  // calibration_sessions' own RLS (check_vpra('calibration','approve',
  // orgUnitId), hr_admin-only per the real seeded matrix).
  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

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

      {cycles && cycles.length > 0 && orgUnits && orgUnits.length > 0 ? (
        <CreateCalibrationSessionForm locale={locale} cycles={cycles} orgUnits={orgUnits} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
