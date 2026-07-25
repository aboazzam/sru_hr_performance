import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EmployeeInviteForm } from "@/components/EmployeeInviteForm";

// Auth is enforced centrally by (app)/layout.tsx. VPRA is not — added here
// explicitly (2026-07-25): creating an account (invite or direct) is a
// userManagement action per the project owner's own framing ("اسمح لمن
// لديه صلاحية المستخدمين انشاء حساب موظف")؛ the /employees list already
// hides the link to this page for anyone without it, but a direct URL visit
// must be blocked server-side too, not just by hiding the button.
export default async function EmployeeInvitePage() {
  const t = await getTranslations("EmployeeInvitePage");
  const supabase = await createClient();

  const { data: canManageUsers } = await supabase.rpc("check_vpra", {
    p_process_area: "userManagement",
    p_min_level: "approve",
  });

  if (!canManageUsers) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // RLS-scoped to the caller: org_units_select requires
  // check_vpra('employeeData','view', <unit id>) per unit, so this list is
  // already limited to whatever the current user can see — not every org
  // unit necessarily appears here for an org-unit-scoped caller.
  const { data: orgUnits } = await supabase
    .from("org_units")
    .select("id, name_ar")
    .order("name_ar");

  // roles_select requires userManagement view/approve (migration 6) — the same two
  // roles that can reach this page's employeeData=approve bar (super_admin, hr_admin)
  // both hold userManagement=approve too, so this list is never empty for whoever
  // can actually submit the form.
  const { data: roles } = await supabase.from("roles").select("id, name_ar").order("name_ar");

  // job_titles_select accepts careerPath OR employeeData view — hr_admin
  // holds both, so this list is populated once the Excel import
  // (2026-07-24) has run; empty until then, which the form already
  // tolerates (job title is optional).
  const { data: jobTitles } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level")
    .is("deleted_at", null)
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

      {orgUnits && orgUnits.length > 0 ? (
        <EmployeeInviteForm orgUnits={orgUnits} roles={roles ?? []} jobTitles={jobTitles ?? []} />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
