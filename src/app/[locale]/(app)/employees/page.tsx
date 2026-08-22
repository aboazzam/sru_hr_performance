import { getTranslations } from "next-intl/server";
import { Eye, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ImportOrgStructureExcelForm } from "@/components/ImportOrgStructureExcelForm";
import { EmployeesExportMenu } from "@/components/EmployeesExportMenu";
import { DeleteEmployeeButton } from "@/components/DeleteEmployeeButton";
import { EmployeeApprovalActions } from "@/components/EmployeeApprovalActions";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { RowLink } from "@/components/RowLink";

const statusMessageKeys = {
  active: "statusActive",
  on_leave: "statusOnLeave",
  terminated: "statusTerminated",
} as const;

interface EmployeeRow {
  id: string;
  employee_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  status: string;
  auth_user_id: string | null;
  created_by: string | null;
  approval_status: string;
  org_units: { name_ar: string } | null;
}

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgUnitId?: string; status?: string; sortBy?: string }>;
}) {
  const { q, orgUnitId, status, sortBy } = await searchParams;
  const t = await getTranslations("EmployeesPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // View/Edit/Delete row actions (2026-07-24), account-creation buttons
  // (2026-07-25), and now the approval queue below are each gated by the
  // caller's actual VPRA level, not hardcoded role names.
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissionsByArea = ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).reduce(
    (map, row) => map.set(row.process_area, row.vpra_level),
    new Map<ProcessArea, VpraLevel>()
  );
  const employeeDataLevel = permissionsByArea.get("employeeData") ?? "none";
  const canEditDelete = hasVpraAccess(employeeDataLevel, "approve");
  const canApproveEmployeeData = hasVpraAccess(employeeDataLevel, "approve");

  // 2026-07-25: "لمن ليس لديهم صلاحية على المستخدمين لا يظهر لهم الأيقونات
  // الاضافة والاستيراد فقط التصدير وشريط البحث" — Add/Assign-supervisor/
  // Import are account-creation-adjacent actions gated on userManagement
  // specifically, not employeeData.
  const userManagementLevel = permissionsByArea.get("userManagement") ?? "none";
  const canManageAccounts = hasVpraAccess(userManagementLevel, "approve");

  const selectColumns =
    "id, employee_number, full_name_ar, full_name_en, status, auth_user_id, created_by, approval_status, org_units(name_ar)";

  // RLS-scoped to the caller (profiles_select: self row, employeeData-scoped
  // view, recursive subordinate-chain view under employeeDataSubordinates,
  // or created_by = self) — an unauthorized caller simply gets fewer/zero
  // rows here, no separate "forbidden" check needed. Only 'approved' rows
  // ever appear in the main sectioned list (2026-07-25 approval workflow) —
  // 'pending'/'rejected' rows are surfaced separately below instead.
  let approvedQuery = supabase.from("profiles").select(selectColumns).is("deleted_at", null).eq("approval_status", "approved");
  if (orgUnitId) approvedQuery = approvedQuery.eq("org_unit_id", orgUnitId);
  if (status) approvedQuery = approvedQuery.eq("status", status);

  const [{ data: approvedData }, { data: pendingData }, { data: mineData }, { data: orgUnitsData }] = await Promise.all([
    approvedQuery,
    // Approval queue — only ever rendered below when canApproveEmployeeData
    // is true, but RLS already limits this independently of that UI gate.
    supabase.from("profiles").select(selectColumns).is("deleted_at", null).eq("approval_status", "pending"),
    // "طلباتي" — the preparer's own pending/rejected submissions, visible
    // regardless of any other grant (profiles_select's created_by branch).
    user
      ? supabase
          .from("profiles")
          .select(selectColumns)
          .is("deleted_at", null)
          .eq("created_by", user.id)
          .in("approval_status", ["pending", "rejected"])
      : Promise.resolve({ data: [] as EmployeeRow[] }),
    supabase.from("org_units").select("id, name_ar").order("name_ar"),
  ]);

  let approvedEmployees = (approvedData ?? []) as unknown as EmployeeRow[];
  const pendingEmployees = (pendingData ?? []) as unknown as EmployeeRow[];
  const myPendingOrRejected = (mineData ?? []) as unknown as EmployeeRow[];
  const orgUnits = orgUnitsData ?? [];

  // The free-text `q` search is deliberately applied in JS after fetching,
  // not via a raw PostgREST `.or()` filter string — untrusted search input
  // could contain commas/parentheses meaningful in that filter DSL, and this
  // list is small enough that an in-memory filter avoids the escaping
  // question entirely.
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    approvedEmployees = approvedEmployees.filter(
      (e) =>
        includesIgnoringHamza(e.full_name_ar.toLowerCase(), needle) ||
        (e.full_name_en ? e.full_name_en.toLowerCase().includes(needle) : false) ||
        e.employee_number.toLowerCase().includes(needle)
    );
  }

  // Role display: a linked account's role lives in `user_roles` (keyed by
  // auth_user_id); an invited-but-not-yet-accepted profile's role lives in
  // `pending_role_assignments` (keyed by profile_id) until
  // link_profile_to_auth_user() promotes it. Both are gated by
  // userManagement>=view/approve respectively, so a caller without that
  // grant simply gets empty results here.
  const allVisibleRows = [...approvedEmployees, ...pendingEmployees, ...myPendingOrRejected];
  const authUserIds = allVisibleRows.map((e) => e.auth_user_id).filter((id): id is string => !!id);
  const pendingProfileIds = allVisibleRows.filter((e) => !e.auth_user_id).map((e) => e.id);

  const [{ data: userRolesData }, { data: pendingRolesData }] = await Promise.all([
    authUserIds.length > 0
      ? supabase.from("user_roles").select("user_id, roles(name_ar)").in("user_id", authUserIds)
      : Promise.resolve({ data: [] as { user_id: string; roles: { name_ar: string } | null }[] }),
    pendingProfileIds.length > 0
      ? supabase.from("pending_role_assignments").select("profile_id, roles(name_ar)").in("profile_id", pendingProfileIds)
      : Promise.resolve({ data: [] as { profile_id: string; roles: { name_ar: string } | null }[] }),
  ]);

  // A user can hold the SAME role via several org-unit-scoped rows (one per
  // granted unit) — de-duplicated by name here (a Set) so the role shows
  // once regardless of how many org units it was granted across.
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

  // 2026-07-25: "تكون مقسمة على شكل سكاشن لكل قسم او ادارة" — the approved
  // list is grouped into one section per org unit for everyone (not
  // conditioned on any particular permission), sections sorted alphabetically
  // by org unit name; within each section, employees sort alphabetically by
  // name by default, or by employee number if requested ("يمكن الفرز على
  // الحروف الابجدية" — sorting is offered as a choice, not forced).
  const sortByNumber = sortBy === "number";
  const sections = new Map<string, EmployeeRow[]>();
  for (const employee of approvedEmployees) {
    const key = employee.org_units?.name_ar ?? t("noOrgUnitSection");
    const list = sections.get(key) ?? [];
    list.push(employee);
    sections.set(key, list);
  }
  const sortedSectionEntries = [...sections.entries()].sort(([a], [b]) => a.localeCompare(b, "ar"));
  for (const [, list] of sortedSectionEntries) {
    list.sort((a, b) =>
      sortByNumber
        ? a.employee_number.localeCompare(b.employee_number, "ar")
        : a.full_name_ar.localeCompare(b.full_name_ar, "ar")
    );
  }

  function renderRow(employee: EmployeeRow) {
    return (
      <RowLink key={employee.id} href={`/employees/${employee.id}`}>
        <td>{employee.employee_number}</td>
        <td>
          <Link href={`/employees/${employee.id}`} className="sru-row-link-title">
            {employee.full_name_ar}
          </Link>
          {employee.full_name_en && <span className="sru-name-en">{employee.full_name_en}</span>}
        </td>
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
      </RowLink>
    );
  }

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
              <Link href="/employees/assign-supervisor" className="sru-btn sru-btn-primary">
                {t("assignSupervisor")}
              </Link>
              <ImportOrgStructureExcelForm templateHref="/templates/sru-employees-import-template.xlsx" note={t("importNoteEmployeesOnly")} />
            </>
          )}
          {hasVpraAccess(employeeDataLevel, "prepare") && (
            <Link href="/employees/new" className="sru-btn sru-btn-primary">
              {t("addEmployee")}
            </Link>
          )}
          <EmployeesExportMenu />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      {myPendingOrRejected.length > 0 && (
        <div className="sru-card" style={{ padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t("myRequestsHeading")}</h2>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployeeNumber")}</th>
                  <th>{t("columnName")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnApprovalStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {myPendingOrRejected.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.employee_number}</td>
                    <td>
                      {employee.full_name_ar}
                      {employee.full_name_en && <span className="sru-name-en">{employee.full_name_en}</span>}
                    </td>
                    <td>{employee.org_units?.name_ar ?? "—"}</td>
                    <td>{t(employee.approval_status === "pending" ? "approvalStatusPending" : "approvalStatusRejected")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canApproveEmployeeData && pendingEmployees.length > 0 && (
        <div className="sru-card" style={{ padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t("pendingApprovalHeading")}</h2>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployeeNumber")}</th>
                  <th>{t("columnName")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {pendingEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.employee_number}</td>
                    <td>
                      {employee.full_name_ar}
                      {employee.full_name_en && <span className="sru-name-en">{employee.full_name_en}</span>}
                    </td>
                    <td>{employee.org_units?.name_ar ?? "—"}</td>
                    <td className="no-print">
                      <EmployeeApprovalActions profileId={employee.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            <select name="status" defaultValue={status ?? ""} style={{ width: "100%", padding: "6px 10px", marginBottom: 10 }}>
              <option value="">{t("filterAllStatuses")}</option>
              <option value="active">{t("statusActive")}</option>
              <option value="on_leave">{t("statusOnLeave")}</option>
              <option value="terminated">{t("statusTerminated")}</option>
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {t("sortByLabel")}
            </label>
            <select name="sortBy" defaultValue={sortBy ?? "name"} style={{ width: "100%", padding: "6px 10px" }}>
              <option value="name">{t("sortByName")}</option>
              <option value="number">{t("sortByNumber")}</option>
            </select>
          </div>
        </details>
        <button type="submit" className="sru-btn sru-btn-primary">
          {t("searchButton")}
        </button>
        {(q || orgUnitId || status || sortBy) && (
          <Link href="/employees" className="sru-btn">
            {t("resetFiltersButton")}
          </Link>
        )}
      </form>

      {sortedSectionEntries.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        sortedSectionEntries.map(([sectionName, list]) => (
          <div key={sectionName} className="sru-card" style={{ marginBottom: 20 }}>
            <div style={{ padding: "12px 16px 0" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>
                {sectionName} <span style={{ color: "var(--sru-muted)", fontWeight: 400, fontSize: 13 }}>({list.length})</span>
              </h2>
            </div>
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
                <tbody>{list.map(renderRow)}</tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
