import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StrategicIdentityForm } from "@/components/StrategicIdentityForm";
import { StrategicValueRow } from "@/components/StrategicValueRow";
import { AddStrategicValueForm } from "@/components/AddStrategicValueForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx. Real write authorization
// is strategic_identity/strategic_values' own RLS
// (check_vpra_global('strategicPlanning','approve'), strategy_admin only —
// 20260728000002). This page requires 'view' to render at all, matching
// strategic_identity_select/strategic_values_select's own bar (the same
// audience that already sees /kpis/strategic-goals, including ceo's
// read-only follow-up access).
export default async function StrategicIdentityPage() {
  const t = await getTranslations("StrategicIdentityPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const strategicPlanningLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "strategicPlanning"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(strategicPlanningLevel, "view");
  const canEdit = hasVpraAccess(strategicPlanningLevel, "approve");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const { data: identity } = await supabase
    .from("strategic_identity")
    .select("vision_ar, vision_en, mission_ar, mission_en")
    .maybeSingle();

  const { data: valuesData } = await supabase
    .from("strategic_values")
    .select("id, title_ar, title_en, description_ar")
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const values = (valuesData ?? []) as Array<{ id: string; title_ar: string; title_en: string | null; description_ar: string | null }>;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <div className="sru-card" style={{ padding: 20, marginBottom: 24 }}>
        <StrategicIdentityForm canEdit={canEdit} identity={identity ?? null} />
      </div>

      <div className="sru-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("valuesHeading")}</h2>
        {values.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("valuesEmpty")}</p>
        ) : (
          values.map((v) => (
            <StrategicValueRow key={v.id} valueId={v.id} initialTitleAr={v.title_ar} initialTitleEn={v.title_en} initialDescriptionAr={v.description_ar} />
          ))
        )}
        {canEdit && <AddStrategicValueForm />}
      </div>
    </div>
  );
}
