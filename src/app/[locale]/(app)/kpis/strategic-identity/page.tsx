import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StrategicIdentityForm } from "@/components/StrategicIdentityForm";
import { StrategicValueRow } from "@/components/StrategicValueRow";
import { AddStrategicValueForm } from "@/components/AddStrategicValueForm";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Star } from "lucide-react";
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
  // 'prepare' (إعداد), not 'approve' -- the project owner confirmed
  // (2026-07-30) that the middle tier means edit rights only, with no
  // draft->approve workflow. Matches strategic_identity/strategic_values'
  // own write policies, lowered to the same bar in 20260730000002 (without
  // that migration this form's every submit would be rejected by Postgres).
  const canEdit = hasVpraAccess(strategicPlanningLevel, "prepare");

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
      <GroupTabs groupKey="strategicPlan" current="kpis/strategic-identity" />
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <StrategicIdentityForm canEdit={canEdit} identity={identity ?? null} />

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Star size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("valuesHeading")}</h3>
          </div>
        </div>
        {values.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("valuesEmpty")}</p>
        ) : (
          values.map((v) => (
            <StrategicValueRow key={v.id} valueId={v.id} initialTitleAr={v.title_ar} initialTitleEn={v.title_en} initialDescriptionAr={v.description_ar} />
          ))
        )}
        {canEdit && <AddStrategicValueForm />}
      </section>
    </div>
  );
}
