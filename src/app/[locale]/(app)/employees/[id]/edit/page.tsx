import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EditEmployeeForm } from "@/components/EditEmployeeForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx. The real write bar is
// profiles_update's own RLS (employeeData>=prepare); this page additionally
// requires the higher 'approve' level to even render the form, matching
// the Edit button's own visibility gate on the list/detail pages.
export default async function EmployeeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("EmployeeEditPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const employeeDataLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "employeeData"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(employeeDataLevel, "approve");

  if (!canEdit) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, employee_number, full_name_ar, full_name_en, email, username, auth_user_id, status, org_unit_id, job_title_id, hire_date, qualification, certificates, education_speciality, date_of_birth, mobile, marital_status, gender, nationality, employee_category, insurance_category"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("notFound")}</p>
      </div>
    );
  }

  const { data: orgUnits } = await supabase.from("org_units").select("id, name_ar").order("name_ar");
  const { data: jobTitles } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level")
    .is("deleted_at", null)
    .order("name_ar");

  // Role & Permissions section (2026-07-25, "بالنسبة لاسناد الدور لا يظهر
  // في النموذجين الا لمن لديه صلاحيات اضافة المستخدمين") — same
  // userManagement>=approve gate as the add-employee form's account
  // section, reusing UserRoleAssignRow verbatim.
  const { data: canManageUsersData } = await supabase.rpc("check_vpra", {
    p_process_area: "userManagement",
    p_min_level: "approve",
  });
  const canManageUsers = !!canManageUsersData;

  let roles: { id: string; name_ar: string }[] = [];
  let initialRoleIds: string[] = [];
  if (canManageUsers) {
    const { data: rolesData } = await supabase.from("roles").select("id, name_ar").order("name_ar");
    roles = rolesData ?? [];

    if (profile.auth_user_id) {
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role_id")
        .eq("user_id", profile.auth_user_id)
        .eq("scope_type", "all");
      initialRoleIds = (userRoles ?? []).map((r) => r.role_id);
    } else {
      const { data: pendingRoles } = await supabase
        .from("pending_role_assignments")
        .select("role_id")
        .eq("profile_id", profile.id)
        .eq("scope_type", "all");
      initialRoleIds = (pendingRoles ?? []).map((r) => r.role_id);
    }
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {profile.full_name_ar} — {profile.employee_number}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <EditEmployeeForm
        profile={profile}
        orgUnits={orgUnits ?? []}
        jobTitles={jobTitles ?? []}
        roles={roles}
        canManageUsers={canManageUsers}
        initialRoleIds={initialRoleIds}
      />
    </div>
  );
}
