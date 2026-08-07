import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { formatDateDmy } from "@/lib/dateParts";
import { getLocale } from "next-intl/server";

// Auth is enforced centrally by (app)/layout.tsx. Real row visibility is
// profiles_select's own RLS (self-row OR employeeData>=view) — a missing
// row and an RLS-blocked row render identically on purpose, same
// discipline as every other detail page in this app.
export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("EmployeeDetailPage");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, employee_number, full_name_ar, full_name_en, email, status, auth_user_id, hire_date, qualification, education_speciality, date_of_birth, mobile, marital_status, gender, nationality, employee_category, insurance_category, org_units(name_ar), job_titles(name_ar, grade_level)"
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

  const employee = profile as unknown as {
    id: string;
    employee_number: string;
    full_name_ar: string;
    full_name_en: string | null;
    email: string;
    status: string;
    auth_user_id: string | null;
    hire_date: string | null;
    qualification: string | null;
    education_speciality: string | null;
    date_of_birth: string | null;
    mobile: string | null;
    marital_status: string | null;
    gender: string | null;
    nationality: string | null;
    employee_category: string | null;
    insurance_category: string | null;
    org_units: { name_ar: string } | null;
    job_titles: { name_ar: string; grade_level: number } | null;
  };

  const roleLabel = employee.auth_user_id
    ? (
        await supabase
          .from("user_roles")
          .select("roles(name_ar)")
          .eq("user_id", employee.auth_user_id)
      ).data
    : (
        await supabase
          .from("pending_role_assignments")
          .select("roles(name_ar)")
          .eq("profile_id", employee.id)
      ).data;

  const roleNames = ((roleLabel ?? []) as unknown as { roles: { name_ar: string } | null }[])
    .map((r) => r.roles?.name_ar)
    .filter((n): n is string => !!n);

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const employeeDataLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "employeeData"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(employeeDataLevel, "approve");

  const statusLabelKeys: Record<string, string> = {
    active: "statusActive",
    on_leave: "statusOnLeave",
    terminated: "statusTerminated",
  };

  const fields: Array<[string, string]> = [
    [t("fieldEmployeeNumber"), employee.employee_number],
    [t("fieldNameAr"), employee.full_name_ar],
    [t("fieldNameEn"), employee.full_name_en ?? "—"],
    [t("fieldEmail"), employee.email],
    [t("fieldOrgUnit"), employee.org_units?.name_ar ?? "—"],
    [t("fieldJobTitle"), employee.job_titles ? `${employee.job_titles.name_ar} (${employee.job_titles.grade_level})` : "—"],
    [t("fieldRole"), roleNames.length > 0 ? roleNames.join("، ") : t("roleNone")],
    [t("fieldStatus"), t(statusLabelKeys[employee.status] ?? "statusActive")],
    [t("fieldAccount"), employee.auth_user_id ? t("accountActive") : t("accountPending")],
    [t("fieldHireDate"), formatDateDmy(employee.hire_date, locale)],
    [t("fieldQualification"), employee.qualification ?? "—"],
    [t("fieldEducationSpeciality"), employee.education_speciality ?? "—"],
    [t("fieldDateOfBirth"), formatDateDmy(employee.date_of_birth, locale)],
    [t("fieldMobile"), employee.mobile ?? "—"],
    [t("fieldMaritalStatus"), employee.marital_status ?? "—"],
    [t("fieldGender"), employee.gender ?? "—"],
    [t("fieldNationality"), employee.nationality ?? "—"],
    [t("fieldEmployeeCategory"), employee.employee_category ?? "—"],
    [t("fieldInsuranceCategory"), employee.insurance_category ?? "—"],
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {employee.full_name_ar}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{employee.employee_number}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <Link href={`/employees/${employee.id}/edit`} className="sru-btn sru-btn-primary">
              {t("editButton")}
            </Link>
          )}
          <Link href="/employees" className="sru-btn">
            {t("backButton")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <div className="sru-card">
        <div className="table-scroll">
          <table className="admin-matrix">
            <tbody>
              {fields.map(([label, value]) => (
                <tr key={label}>
                  <th style={{ width: "35%" }}>{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
