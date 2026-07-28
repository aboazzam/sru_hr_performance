import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignGoalForm } from "@/components/AssignGoalForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// goals_insert's own RLS requires check_vpra('goalAssignment','prepare',
// org_unit_id) OR is_my_direct_report(employee_id) (20260718000010) — this
// form was previously reachable and fully renderable by any authenticated
// user (same bug class found in the audit that fixed kpis/strategic-goals).
// Gated here at the flat `goalAssignment>=prepare` bar. Accepted trade-off,
// same class already documented elsewhere in this app (e.g. the `employees`
// nav item's employeeData/employeeDataSubordinates split): a supervisor who
// only has the is_my_direct_report relationship (no flat grant) also loses
// this page, since there is no per-row relationship signal available at
// page-render time (unlike a single employee id, this form addresses
// arbitrary employees). Real per-employee write authorization is still
// enforced by goals_insert's own RLS, unchanged.
export default async function AssignGoalPage() {
  const t = await getTranslations("AssignGoalPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const goalAssignmentLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "goalAssignment"
    )?.vpra_level ?? "none";
  const canAssign = hasVpraAccess(goalAssignmentLevel, "prepare");

  if (!canAssign) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

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
