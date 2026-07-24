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
      "id, employee_number, full_name_ar, full_name_en, email, status, org_unit_id, job_title_id, hire_date, qualification, education_speciality, date_of_birth, mobile, marital_status, gender, nationality, employee_category, insurance_category"
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

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {profile.full_name_ar} — {profile.employee_number}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <EditEmployeeForm profile={profile} orgUnits={orgUnits ?? []} jobTitles={jobTitles ?? []} />
    </div>
  );
}
