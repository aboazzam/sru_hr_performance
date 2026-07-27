import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignKpiForm } from "@/components/AssignKpiForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function AssignKpiPage() {
  const t = await getTranslations("AssignKpiPage");
  const supabase = await createClient();

  // RLS-scoped to the caller. profiles_select requires check_vpra
  // ('employeeData','view', org_unit_id) (or self/direct-report) — not
  // necessarily the same grant as kpiAssignment=prepare that the actual
  // INSERT below requires, so seeing employees here doesn't guarantee the
  // submit will succeed; the real authorization boundary is the Server
  // Action's INSERT (enforced by Postgres RLS), not this list. Same
  // convention as AssignGoalPage.
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

  // kpi_library_select's RLS (check_vpra('kpiLibrary','view', org_unit_id))
  // naturally scopes this to entries distributed to the caller's own
  // department — exactly "مدير الاستراتيجية يوزعها على الادارات لكن
  // الرئيس المباشر هو الذي يحدد مؤشرات الاداء على مستوى الموظف": the
  // supervisor picks from what strategy_admin distributed to their unit.
  const { data: kpiLibrary } = await supabase
    .from("kpi_library")
    .select("id, title_ar, default_weight, unit_ar")
    .is("deleted_at", null)
    .order("title_ar");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 ? (
        <AssignKpiForm employees={employees} cycles={cycles ?? []} kpiLibrary={kpiLibrary ?? []} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
