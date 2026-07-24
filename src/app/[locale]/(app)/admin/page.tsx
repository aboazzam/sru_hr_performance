import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { UserRoleAssignRow } from "@/components/UserRoleAssignRow";
import { PrintButton } from "@/components/PrintButton";
import { GroupTabs } from "@/components/layout/GroupTabs";
import {
  defaultRoles,
  evaluationStates,
  evaluationStateLabels,
  getEvaluationStatePermission,
  vpraLevelLabels,
  hasVpraAccess,
  type VpraLevel,
  type ProcessArea,
  type EvaluationActorRole,
} from "@/lib/vpra";

const vpraLevelStyle: Record<VpraLevel, { background: string; color: string }> = {
  none: { background: "rgba(107, 90, 128, 0.12)", color: "var(--sru-muted)" },
  view: { background: "var(--sru-blue-light)", color: "var(--sru-blue)" },
  prepare: { background: "var(--sru-purple-light)", color: "var(--sru-purple)" },
  recommend: { background: "#e2d3f0", color: "var(--sru-purple-dark)" },
  approve: { background: "var(--sru-purple)", color: "#fff" },
};

const evaluationActorRoles: EvaluationActorRole[] = [
  "employee",
  "supervisor",
  "field_supervisor",
  "manager",
  "committee",
  "hr_admin",
];

function roleLabel(roleCode: string) {
  return defaultRoles.find((r) => r.roleCode === roleCode)?.nameAr ?? roleCode;
}

// Redesigned 2026-07-24 (inspired by the reference screenshots' Users list +
// Positions list + position-permission-editor pattern, adapted: no "add
// user" flow since every user already exists as an employee — only
// role/permission ASSIGNMENT is exposed here). "Positions" = the `roles`
// table (CLAUDE.md §4-B's admin-configurable roles), listed with live user
// counts and full create/edit/delete. Org-structure content was moved out
// entirely (2026-07-24, a separate change) — this page is now scoped
// purely to users/roles/permissions.
export default async function AdminPage() {
  const t = await getTranslations("AdminPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const userManagementLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "userManagement"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(userManagementLevel, "approve");

  // profiles_select's own RLS (self-row OR employeeData view) already scopes
  // this — an org-unit-scoped or unauthorized caller just sees fewer rows,
  // no separate check needed here.
  const { data: employeesData } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, auth_user_id")
    .is("deleted_at", null)
    .order("full_name_ar");
  const employees = (employeesData ?? []) as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    auth_user_id: string | null;
  }>;

  // roles_select requires userManagement>=view — a caller without any grant
  // here simply sees an empty Positions list, same RLS-only-limits
  // discipline as everywhere else in this app.
  const { data: rolesData } = await supabase
    .from("roles")
    .select("id, role_code, name_ar, name_en, is_system_role")
    .is("deleted_at", null)
    .order("created_at");
  const roles = (rolesData ?? []) as Array<{
    id: string;
    role_code: string;
    name_ar: string;
    name_en: string | null;
    is_system_role: boolean;
  }>;
  const roleOptions = roles.map((r) => ({ id: r.id, name_ar: r.name_ar }));

  const [{ data: userRolesData }, { data: pendingRolesData }] = await Promise.all([
    supabase.from("user_roles").select("user_id, role_id, scope_type"),
    supabase.from("pending_role_assignments").select("profile_id, role_id, scope_type"),
  ]);
  const userRoles = (userRolesData ?? []) as Array<{ user_id: string; role_id: string; scope_type: string }>;
  const pendingRoles = (pendingRolesData ?? []) as Array<{ profile_id: string; role_id: string; scope_type: string }>;

  // Per-role headcount (any scope) for the Positions list.
  const countByRoleId = new Map<string, number>();
  for (const row of [...userRoles, ...pendingRoles]) {
    countByRoleId.set(row.role_id, (countByRoleId.get(row.role_id) ?? 0) + 1);
  }

  // Per-employee CURRENT global role, for the Users list's select prefill —
  // this simple screen only manages the scope_type='all' assignment (see
  // assignUserRole's own doc comment for why org-unit-scoped rows are left
  // alone). If more than one somehow exists, the first is shown; saving
  // collapses back to exactly one.
  const globalRoleIdByAuthUserId = new Map<string, string>();
  for (const row of userRoles) {
    if (row.scope_type === "all" && !globalRoleIdByAuthUserId.has(row.user_id)) {
      globalRoleIdByAuthUserId.set(row.user_id, row.role_id);
    }
  }
  const globalRoleIdByProfileId = new Map<string, string>();
  for (const row of pendingRoles) {
    if (row.scope_type === "all" && !globalRoleIdByProfileId.has(row.profile_id)) {
      globalRoleIdByProfileId.set(row.profile_id, row.role_id);
    }
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin" />
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
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <PrintButton />
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <section style={{ marginBottom: 40 }}>
        <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 4 }}>
          {t("usersHeading")}
        </h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 14 }}>{t("usersSubtitle")}</p>
        {employees.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noUsers")}</p>
        ) : (
          <div className="sru-card">
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("userColumnNumber")}</th>
                    <th>{t("userColumnName")}</th>
                    <th>{t("userColumnRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    const currentRoleId = employee.auth_user_id
                      ? globalRoleIdByAuthUserId.get(employee.auth_user_id) ?? null
                      : globalRoleIdByProfileId.get(employee.id) ?? null;
                    return (
                      <tr key={employee.id}>
                        <td style={{ fontSize: 13 }}>{employee.employee_number}</td>
                        <td style={{ fontSize: 13 }}>{employee.full_name_ar}</td>
                        <td>
                          {canManage ? (
                            <UserRoleAssignRow
                              profileId={employee.id}
                              authUserId={employee.auth_user_id}
                              roles={roleOptions}
                              initialRoleId={currentRoleId}
                            />
                          ) : (
                            <span style={{ fontSize: 13 }}>
                              {roles.find((r) => r.id === currentRoleId)?.name_ar ?? t("roleNoneOption")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
          <h2 className="sru-title" style={{ fontSize: 18 }}>
            {t("positionsHeading")}
          </h2>
          {canManage && (
            <Link href="/admin/roles/new" className="sru-btn sru-btn-primary">
              {t("createRoleButton")}
            </Link>
          )}
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginBottom: 14 }}>{t("positionsSubtitle")}</p>
        {roles.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noPositionsRoles")}</p>
        ) : (
          <div className="sru-card">
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("positionColumnName")}</th>
                    <th>{t("positionColumnCode")}</th>
                    <th>{t("positionColumnCount")}</th>
                    <th>{t("positionColumnSystem")}</th>
                    {canManage && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td style={{ fontSize: 13, fontWeight: 700 }}>{role.name_ar}</td>
                      <td className="sru-en" style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>
                        {role.role_code}
                      </td>
                      <td style={{ fontSize: 13 }}>{countByRoleId.get(role.id) ?? 0}</td>
                      <td style={{ fontSize: 12.5 }}>{role.is_system_role ? t("systemRoleYes") : t("systemRoleNo")}</td>
                      {canManage && (
                        <td>
                          <Link href={`/admin/roles/${role.id}`} className="sru-btn" style={{ fontSize: 12.5, padding: "5px 10px" }}>
                            {t("editButton")}
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t("matrixHeading")}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 14 }}>{t("matrixCaption")}</p>
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("stateColumn")}</th>
                  {evaluationActorRoles.map((role) => (
                    <th key={role}>{roleLabel(role)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evaluationStates.map((state) => (
                  <tr key={state}>
                    <td className="admin-matrix-state">{evaluationStateLabels[state]}</td>
                    {evaluationActorRoles.map((role) => {
                      const level = getEvaluationStatePermission(state, role);
                      return (
                        <td key={role}>
                          <span className="sru-chip admin-matrix-chip" style={vpraLevelStyle[level]}>
                            {vpraLevelLabels[level]}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
