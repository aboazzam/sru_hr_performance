import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EmployeeInviteForm } from "@/components/EmployeeInviteForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// This page previously relied only on the 2026-07-25 comment's claim that
// "entering employee data only requires employeeData>=prepare, enforced by
// profiles_insert's RLS -- no separate page-level check needed" -- but that
// left the entire form (all 20+ fields, plus the account-creation section
// when canManageUsers happened to be true) reachable and renderable by any
// authenticated user, same bug class found in the audit that fixed
// kpis/strategic-goals: relying solely on the write RLS instead of also
// checking at render time. Now gated explicitly at employeeData>=prepare,
// matching profiles_insert's own bar. Creating an actual LOGIN account
// (mode='invite'|'direct') stays a separate userManagement action -- the
// form itself only shows that section when canManageUsers is true, and
// inviteEmployee re-checks it server-side too.
export default async function EmployeeInvitePage() {
  const t = await getTranslations("EmployeeInvitePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).reduce(
    (acc, row) => ({ ...acc, [row.process_area]: row.vpra_level }),
    {} as Partial<Record<ProcessArea, VpraLevel>>
  );
  const canEnterData = hasVpraAccess(permissions.employeeData ?? "none", "prepare");
  const canManageUsers = hasVpraAccess(permissions.userManagement ?? "none", "approve");

  if (!canEnterData) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
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
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {orgUnits && orgUnits.length > 0 ? (
        <EmployeeInviteForm
          orgUnits={orgUnits}
          roles={roles ?? []}
          jobTitles={jobTitles ?? []}
          canManageUsers={canManageUsers}
        />
      ) : (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      )}
    </div>
  );
}
