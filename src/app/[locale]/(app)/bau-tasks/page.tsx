import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BauTaskForm } from "@/components/BauTaskForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function BauTasksPage() {
  const t = await getTranslations("BauTasksPage");
  const supabase = await createClient();

  // RLS-scoped to the caller. Seeing an employee here (via employeeData)
  // doesn't guarantee the submit below will succeed — the real
  // authorization boundary is bau_tasks' own RLS (self-row OR
  // check_vpra('bauTasks','approve', org_unit_id)), enforced by the Server
  // Action's INSERT, not this list.
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
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {employees && employees.length > 0 ? (
        <BauTaskForm employees={employees} cycles={cycles ?? []} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
