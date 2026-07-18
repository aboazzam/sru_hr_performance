import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignGoalForm } from "@/components/AssignGoalForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function AssignGoalPage() {
  const t = await getTranslations("AssignGoalPage");
  const supabase = await createClient();

  // RLS-scoped to the caller. profiles_select requires check_vpra
  // ('employeeData','view', org_unit_id) (or self) — not necessarily the
  // same grant as goalAssignment=prepare that the actual INSERT below
  // requires, so seeing employees here doesn't guarantee the submit will
  // succeed; the real authorization boundary is the Server Action's INSERT
  // (enforced by Postgres RLS), not this list. An empty list is used here
  // only as a practical "nothing to do" signal, same convention as
  // EmployeeInvitePage's org_units check.
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

  const { data: goalLibrary } = await supabase
    .from("goal_library")
    .select("id, title_ar, default_weight")
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
        <AssignGoalForm
          employees={employees}
          cycles={cycles ?? []}
          goalLibrary={goalLibrary ?? []}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
