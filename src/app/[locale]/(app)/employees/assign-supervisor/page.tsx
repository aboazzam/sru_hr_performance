import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ManageSupervisorsForm } from "@/components/ManageSupervisorsForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function AssignSupervisorPage() {
  const t = await getTranslations("AssignSupervisorPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (profiles_select). Seeing employees here
  // doesn't guarantee an assignment change below will succeed — the real
  // authorization boundary is profiles_update's own RLS
  // (check_vpra('employeeData','prepare', org_unit_id)), enforced by the
  // Server Action's UPDATE, not this list.
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, supervisor_id")
    .is("deleted_at", null)
    .order("employee_number");

  const employees = employeesData ?? [];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees.length > 0 ? (
        <ManageSupervisorsForm
          employees={employees.map((e) => ({
            id: e.id,
            employeeNumber: e.employee_number,
            fullNameAr: e.full_name_ar,
            initialSupervisorId: e.supervisor_id,
          }))}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
