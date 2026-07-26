import { getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { DeleteRoleButton } from "@/components/DeleteRoleButton";
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

  // Per-role headcount (any scope) for the Positions list — counts DISTINCT
  // users, not rows: a single user can hold several org-unit-scoped rows
  // for the same role (one per granted unit, from the add-employee form's
  // multi-org-unit scope picker), which would otherwise inflate the count.
  const usersPerRole = new Map<string, Set<string>>();
  for (const row of userRoles) {
    const set = usersPerRole.get(row.role_id) ?? new Set<string>();
    set.add(`u:${row.user_id}`);
    usersPerRole.set(row.role_id, set);
  }
  for (const row of pendingRoles) {
    const set = usersPerRole.get(row.role_id) ?? new Set<string>();
    set.add(`p:${row.profile_id}`);
    usersPerRole.set(row.role_id, set);
  }
  const countByRoleId = new Map<string, number>();
  for (const [roleId, set] of usersPerRole) countByRoleId.set(roleId, set.size);

  // Per-employee CURRENT global roles, for the Users list's checkbox-dropdown
  // prefill — 2026-07-25: an employee may hold several roles at once (e.g.
  // hr_admin AND competencies_admin), so this is now an array rather than
  // "the first row found." Still only the scope_type='all' assignments (see
  // assignUserRole's own doc comment for why org-unit-scoped rows are left
  // alone).
  const globalRoleIdsByAuthUserId = new Map<string, string[]>();
  for (const row of userRoles) {
    if (row.scope_type !== "all") continue;
    const list = globalRoleIdsByAuthUserId.get(row.user_id) ?? [];
    list.push(row.role_id);
    globalRoleIdsByAuthUserId.set(row.user_id, list);
  }
  const globalRoleIdsByProfileId = new Map<string, string[]>();
  for (const row of pendingRoles) {
    if (row.scope_type !== "all") continue;
    const list = globalRoleIdsByProfileId.get(row.profile_id) ?? [];
    list.push(row.role_id);
    globalRoleIdsByProfileId.set(row.profile_id, list);
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
          <AdminUsersTable
            users={employees.map((employee) => ({
              ...employee,
              currentRoleIds: employee.auth_user_id
                ? globalRoleIdsByAuthUserId.get(employee.auth_user_id) ?? []
                : globalRoleIdsByProfileId.get(employee.id) ?? [],
            }))}
            roleOptions={roleOptions}
            roles={roles}
            canManage={canManage}
            noneLabel={t("roleNoneOption")}
          />
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
                  {roles.map((role) => {
                    const roleUserCount = countByRoleId.get(role.id) ?? 0;
                    return (
                      <tr key={role.id}>
                        <td style={{ fontSize: 13, fontWeight: 700 }}>{role.name_ar}</td>
                        <td className="sru-en" style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>
                          {role.role_code}
                        </td>
                        <td style={{ fontSize: 13 }}>{roleUserCount}</td>
                        <td style={{ fontSize: 12.5 }}>{role.is_system_role ? t("systemRoleYes") : t("systemRoleNo")}</td>
                        {canManage && (
                          <td>
                            <div className="sru-icon-action-group">
                              <Link
                                href={`/admin/roles/${role.id}`}
                                className="sru-icon-action primary"
                                title={t("editButton")}
                                aria-label={t("editButton")}
                              >
                                <Pencil size={15} />
                              </Link>
                              <DeleteRoleButton roleId={role.id} disabled={role.is_system_role || roleUserCount > 0} />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
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
