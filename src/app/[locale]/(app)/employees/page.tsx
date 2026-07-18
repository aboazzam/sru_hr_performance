import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/PrintButton";

const statusMessageKeys = {
  active: "statusActive",
  on_leave: "statusOnLeave",
  terminated: "statusTerminated",
} as const;

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EmployeesPage() {
  const t = await getTranslations("EmployeesPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (profiles_select: self-row OR
  // check_vpra('employeeData','view', org_unit_id)) — an unauthorized or
  // org-unit-scoped caller simply gets fewer/zero rows here, no separate
  // "forbidden" check needed (and none is attempted: a genuinely empty
  // table and a blocked caller render identically, which leaks no more
  // than the RLS boundary itself already allows).
  //
  // The `org_units(name_ar)` embed is a many-to-one relationship
  // (profiles.org_unit_id -> org_units.id), so PostgREST returns a single
  // object per row, not an array — supabase-js infers an array type here
  // only because this client has no generated Database types to tell it
  // the relationship's real cardinality. Cast to the actual runtime shape
  // (verified directly against the REST API) rather than indexing [0]
  // into something that was never actually an array.
  const { data } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, full_name_en, status, auth_user_id, org_units(name_ar)")
    .is("deleted_at", null)
    .order("employee_number");

  const employees = data as unknown as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    full_name_en: string | null;
    status: string;
    auth_user_id: string | null;
    org_units: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/employees/new" className="sru-btn sru-btn-primary">
            {t("addEmployee")}
          </Link>
          <Link href="/employees/assign-supervisor" className="sru-btn sru-btn-primary">
            {t("assignSupervisor")}
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!employees || employees.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployeeNumber")}</th>
                  <th>{t("columnName")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnAccount")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.employee_number}</td>
                    <td>{employee.full_name_ar}</td>
                    <td>{employee.org_units?.name_ar ?? "—"}</td>
                    <td>{t(statusMessageKeys[employee.status as keyof typeof statusMessageKeys])}</td>
                    <td>{employee.auth_user_id ? t("accountActive") : t("accountPending")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
