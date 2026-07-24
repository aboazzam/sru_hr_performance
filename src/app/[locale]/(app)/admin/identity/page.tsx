import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { OrgIdentityForm } from "@/components/OrgIdentityForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx. Real write authorization
// is org_identity's own RLS (check_vpra_global('orgStructure','approve'),
// super_admin-only per the 2026-07-24 recommend/approve split — hr_admin
// holds only 'recommend' there now and can view but not edit). This page
// requires 'view' to render at all, enforced by org_identity_select.
export default async function IdentityPage() {
  const t = await getTranslations("IdentityPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const orgStructureLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "orgStructure"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(orgStructureLevel, "approve");

  const { data: identity } = await supabase
    .from("org_identity")
    .select("logo_url, primary_color, secondary_color")
    .maybeSingle();

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/identity" />
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <OrgIdentityForm canEdit={canEdit} identity={identity} />
    </div>
  );
}
