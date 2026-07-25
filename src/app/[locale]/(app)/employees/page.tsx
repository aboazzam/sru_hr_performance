import { getTranslations } from "next-intl/server";
import { Eye, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { EmployeesExportMenu } from "@/components/EmployeesExportMenu";
import { DeleteEmployeeButton } from "@/components/DeleteEmployeeButton";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

const statusMessageKeys = {
  active: "statusActive",
  on_leave: "statusOnLeave",
  terminated: "statusTerminated",
} as const;

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgUnitId?: string; status?: string }>;
}) {
  const { q, orgUnitId, status } = await searchParams;
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
  //
  // orgUnitId/status are applied server-side via `.eq()` (safe, parameterized).
  // The free-text `q` search is deliberately applied in JS after fetching,
  // not via a raw PostgREST `.or()` filter string — untrusted search input
  // could contain commas/parentheses that are meaningful in that filter
  // DSL, and this list is small enough that an in-memory filter is simpler
  // and avoids the escaping question entirely.
  let query = supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, full_name_en, status, auth_user_id, org_units(name_ar)")
    .is("deleted_at", null)
    .order("employee_number");
  if (orgUnitId) query = query.eq("org_unit_id", orgUnitId);
  if (status) query = query.eq("status", status);

  const { data } = await query;

  let employees = data as unknown as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    full_name_en: string | null;
    status: string;
    auth_user_id: string | null;
    org_units: { name_ar: string } | null;
  }> | null;

  if (q && q.trim() && employees) {
    const needle = q.trim().toLowerCase();
    employees = employees.filter(
      (e) =>
        e.full_name_ar.toLowerCase().includes(needle) ||
        e.full_name_en?.toLowerCase().includes(needle) ||
        e.employee_number.toLowerCase().includes(needle)
    );
  }

  const { data: orgUnitsData } = await supabase.from("org_units").select("id, name_ar").order("name_ar");
  const orgUnits = orgUnitsData ?? [];

  // Role display: a linked account's role lives in `user_roles` (keyed by
  // auth_user_id); an invited-but-not-yet-accepted profile's role lives in
  // `pending_role_assignments` (keyed by profile_id) until
  // link_profile_to_auth_user() promotes it — see 20260721000001. Both are
  // gated by userManagement>=view/approve respectively, so a caller without
  // that grant simply gets empty results here, same as every other RLS
  // boundary in this app (no separate "forbidden" branch needed).
  const authUserIds = (employees ?? []).map((e) => e.auth_user_id).filter((id): id is string => !!id);
  const pendingProfileIds = (employees ?? []).filter((e) => !e.auth_user_id).map((e) => e.id);

  const [{ data: userRolesData }, { data: pendingRolesData }] = await Promise.all([
    authUserIds.length > 0
      ? supabase.from("user_roles").select("user_id, roles(name_ar)").in("user_id", authUserIds)
      : Promise.resolve({ data: [] as { user_id: string; roles: { name_ar: string } | null }[] }),
    pendingProfileIds.length > 0
      ? supabase.from("pending_role_assignments").select("profile_id, roles(name_ar)").in("profile_id", pendingProfileIds)
      : Promise.resolve({ data: [] as { profile_id: string; roles: { name_ar: string } | null }[] }),
  ]);

  // A user can hold the SAME role via several org-unit-scoped rows (one per
  // granted unit, from the add-employee form's multi-org-unit scope picker)
  // — de-duplicated by name here (a Set, not an array) so the role shows
  // once regardless of how many org units it was granted across, not once
  // per row.
  const rolesByAuthUserId = new Map<string, Set<string>>();
  for (const row of (userRolesData ?? []) as unknown as { user_id: string; roles: { name_ar: string } | null }[]) {
    if (!row.roles) continue;
    const set = rolesByAuthUserId.get(row.user_id) ?? new Set<string>();
    set.add(row.roles.name_ar);
    rolesByAuthUserId.set(row.user_id, set);
  }

  const pendingRolesByProfileId = new Map<string, Set<string>>();
  for (const row of (pendingRolesData ?? []) as unknown as { profile_id: string; roles: { name_ar: string } | null }[]) {
    if (!row.roles) continue;
    const set = pendingRolesByProfileId.get(row.profile_id) ?? new Set<string>();
    set.add(row.roles.name_ar);
    pendingRolesByProfileId.set(row.profile_id, set);
  }

  function roleLabel(employee: { id: string; auth_user_id: string | null }): string {
    if (employee.auth_user_id) {
      const roles = rolesByAuthUserId.get(employee.auth_user_id);
      return roles && roles.size > 0 ? [...roles].join("، ") : t("roleNone");
    }
    const pending = pendingRolesByProfileId.get(employee.id);
    return pending && pending.size > 0 ? t("rolePending", { role: [...pending].join("، ") }) : t("roleNone");
  }

  // View/Edit/Delete row actions (2026-07-24 request): gated by the
  // caller's actual `employeeData` VPRA level, not hardcoded role names —
  // "أضفها في جدول الصلاحيات بحيث يمكن اسنادها لمستخدم معين" means any role
  // granted `employeeData=approve` in the permissions matrix gets Edit/
  // Delete automatically, same mechanism NavBar filtering already uses.
  // View has no extra gate — seeing this row at all already requires
  // employeeData>=view via profiles_select's own RLS.
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissionsByArea = ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).reduce(
    (map, row) => map.set(row.process_area, row.vpra_level),
    new Map<ProcessArea, VpraLevel>()
  );
  const employeeDataLevel = permissionsByArea.get("employeeData") ?? "none";
  const canEditDelete = hasVpraAccess(employeeDataLevel, "approve");

  // 2026-07-25: "لمن ليس لديهم صلاحية على المستخدمين لا يظهر لهم الأيقونات
  // الاضافة والاستيراد فقط التصدير وشريط البحث" — Add/Assign-supervisor/
  // Import are account-creation-adjacent actions gated on userManagement
  // specifically, not employeeData (mirrors the real RLS on
  // pending_role_assignments/user_roles, which already requires
  // userManagement='approve' for any role assignment). Row visibility
  // itself needs no extra filtering here — profiles_select's RLS (self row,
  // employeeData-scoped view, or is_my_direct_report) already narrows the
  // query to exactly what a caller without this grant should see.
  const userManagementLevel = permissionsByArea.get("userManagement") ?? "none";
  const canManageAccounts = hasVpraAccess(userManagementLevel, "approve");

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
        <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canManageAccounts && (
            <>
              <Link href="/employees/new" className="sru-btn sru-btn-primary">
                {t("addEmployee")}
              </Link>
              <Link href="/employees/assign-supervisor" className="sru-btn sru-btn-primary">
                {t("assignSupervisor")}
              </Link>
              <ImportOrgStructureExcelForm templateHref="/templates/sru-employees-import-template.xlsx" note={t("importNoteEmployeesOnly")} />
            </>
          )}
          <EmployeesExportMenu />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <form method="get" className="no-print" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap" }}>
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder={t("searchPlaceholder")}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--sru-radius)",
            border: "1px solid var(--sru-border)",
            minWidth: 240,
            fontFamily: "inherit",
          }}
        />
        <details className="sru-filter-details">
          <summary className="sru-btn">{t("filterButton")}</summary>
          <div className="sru-filter-panel">
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {t("filterOrgUnitLabel")}
            </label>
            <select name="orgUnitId" defaultValue={orgUnitId ?? ""} style={{ width: "100%", padding: "6px 10px", marginBottom: 10 }}>
              <option value="">{t("filterAllOrgUnits")}</option>
              {orgUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name_ar}
                </option>
              ))}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {t("filterStatusLabel")}
            </label>
            <select name="status" defaultValue={status ?? ""} style={{ width: "100%", padding: "6px 10px" }}>
              <option value="">{t("filterAllStatuses")}</option>
              <option value="active">{t("statusActive")}</option>
              <option value="on_leave">{t("statusOnLeave")}</option>
              <option value="terminated">{t("statusTerminated")}</option>
            </select>
          </div>
        </details>
        <button type="submit" className="sru-btn sru-btn-primary">
          {t("searchButton")}
        </button>
        {(q || orgUnitId || status) && (
          <Link href="/employees" className="sru-btn">
            {t("resetFiltersButton")}
          </Link>
        )}
      </form>

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
                  <th>{t("columnRole")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnAccount")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.employee_number}</td>
                    <td>{employee.full_name_ar}</td>
                    <td>{employee.org_units?.name_ar ?? "—"}</td>
                    <td>{roleLabel(employee)}</td>
                    <td>{t(statusMessageKeys[employee.status as keyof typeof statusMessageKeys])}</td>
                    <td>{employee.auth_user_id ? t("accountActive") : t("accountPending")}</td>
                    <td className="no-print">
                      <div className="sru-icon-action-group">
                        <Link href={`/employees/${employee.id}`} className="sru-icon-action" title={t("actionView")} aria-label={t("actionView")}>
                          <Eye size={15} />
                        </Link>
                        {canEditDelete && (
                          <>
                            <Link
                              href={`/employees/${employee.id}/edit`}
                              className="sru-icon-action primary"
                              title={t("actionEdit")}
                              aria-label={t("actionEdit")}
                            >
                              <Pencil size={15} />
                            </Link>
                            <DeleteEmployeeButton profileId={employee.id} />
                          </>
                        )}
                      </div>
                    </td>
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
