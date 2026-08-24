import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateEvaluationForm } from "@/components/CreateEvaluationForm";
import { isLocale } from "@/i18n/config";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function CreateEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const { cycleId } = await searchParams;
  const t = await getTranslations("CreateEvaluationPage");
  const supabase = await createClient();

  // RLS-scoped to the caller, same reasoning as the goals/BAU-tasks assign
  // screens: seeing an employee here (via employeeData) doesn't guarantee
  // the create below will succeed — the real authorization boundary is
  // evaluations' own RLS (self-row OR check_vpra('evaluation','approve')).
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar")
    .is("deleted_at", null)
    .order("employee_number");

  const { data: cycles } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 ? (
        <CreateEvaluationForm
          locale={locale}
          employees={employees}
          cycles={cycles ?? []}
          defaultCycleId={cycleId}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
