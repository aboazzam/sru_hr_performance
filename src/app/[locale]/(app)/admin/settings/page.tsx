import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { SystemSettingsForm } from "@/components/SystemSettingsForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// "إعدادات النظام" (System Settings) tab (2026-07-26), starting with a
// single field: the IANA timezone used to display timestamps app-wide.
// Real feedback: the "أنشطة المستخدمين" tab's last-sign-in column was
// rendering in the server's own timezone (UK) instead of Saudi Arabia
// time -- rather than hardcoding a fix, the project owner asked for this to
// be a configurable admin setting.
//
// Gated at `systemSettings>=view`, seeded super_admin-only (same narrow
// tier as `identity` -- see that migration's own doc comment for why:
// `system_settings_select`'s own RLS is the real gate, this page-level
// check just renders an explicit forbidden message instead of a blank
// form, same discipline as /admin/user-activity).
export default async function SystemSettingsPage() {
  const t = await getTranslations("SystemSettingsPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const settingsLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "systemSettings"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(settingsLevel, "view");
  const canEdit = hasVpraAccess(settingsLevel, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="administration" current="admin/settings" />
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data: settings } = await supabase.from("system_settings").select("timezone").maybeSingle();
  const currentTimezone = settings?.timezone ?? "Asia/Riyadh";

  // Not a hand-curated list — every real IANA zone the runtime knows about,
  // so this never silently omits a valid option.
  const timezoneOptions = Intl.supportedValuesOf("timeZone");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/settings" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <SystemSettingsForm canEdit={canEdit} currentTimezone={currentTimezone} timezoneOptions={timezoneOptions} />
    </div>
  );
}
