import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CreateRoleForm } from "@/components/CreateRoleForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Display-only gate (real authorization is roles_insert/role_permissions_insert's
// RLS, check_vpra_global('userManagement','approve')) — same discipline as
// every other create form in this app that pre-checks before rendering.
export default async function CreateRolePage() {
  const t = await getTranslations("AdminPage");
  const supabase = await createClient();
  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "userManagement"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(level, "approve");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px", maxWidth: 1180, margin: "0 auto" }}>
      <GroupTabs groupKey="administration" current="admin" />
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("createRoleTitle")}
      </h1>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />
      {canManage ? <CreateRoleForm /> : <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>}
    </div>
  );
}
