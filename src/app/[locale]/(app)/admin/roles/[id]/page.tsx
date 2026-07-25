import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EditRoleForm } from "@/components/EditRoleForm";
import { DeleteRoleButton } from "@/components/DeleteRoleButton";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Display-only gate, same as /admin/roles/new — real authorization is each
// table's own RLS (check_vpra_global('userManagement', ...)).
export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("AdminPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "userManagement"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(level, "approve");

  const { data: role } = await supabase
    .from("roles")
    .select("id, role_code, name_ar, name_en, is_system_role")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!role) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="administration" current="admin" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("roleNotFound")}</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="administration" current="admin" />
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data: permRows } = await supabase.from("role_permissions").select("process_area, vpra_level").eq("role_id", id);
  const initialPermissions: Partial<Record<ProcessArea, VpraLevel>> = {};
  for (const row of permRows ?? []) {
    initialPermissions[row.process_area as ProcessArea] = row.vpra_level as VpraLevel;
  }

  // Counts DISTINCT users, not rows — a single user can hold several
  // org-unit-scoped rows for the same role (one per granted unit), which
  // would otherwise inflate both this displayed count and the delete gate.
  const [{ data: userRoleRows }, { data: pendingRows }] = await Promise.all([
    supabase.from("user_roles").select("user_id").eq("role_id", id),
    supabase.from("pending_role_assignments").select("profile_id").eq("role_id", id),
  ]);
  const assignedCount = new Set([
    ...(userRoleRows ?? []).map((r) => `u:${r.user_id}`),
    ...(pendingRows ?? []).map((r) => `p:${r.profile_id}`),
  ]).size;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px", maxWidth: 1180, margin: "0 auto" }}>
      <GroupTabs groupKey="administration" current="admin" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {role.name_ar} <span className="sru-en" style={{ fontSize: 14, color: "var(--sru-muted)" }}>{role.role_code}</span>
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("assignedUsersCount", { count: assignedCount })}
          </p>
        </div>
        <DeleteRoleButton roleId={role.id} disabled={role.is_system_role || assignedCount > 0} />
      </div>
      {role.is_system_role && (
        <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 8 }}>{t("systemRoleNotice")}</p>
      )}
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <EditRoleForm
        roleId={role.id}
        initialNameAr={role.name_ar}
        initialNameEn={role.name_en}
        initialPermissions={initialPermissions}
      />
    </div>
  );
}
