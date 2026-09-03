import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyNewCycleForm } from "@/components/ThreeSixtyNewCycleForm";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

export default async function NewThreeSixtyCyclePage() {
  const t = await getTranslations("ThreeSixtyNewCyclePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canCreate = hasVpraAccess(permissions.threeSixty ?? "none", "prepare");

  const { data: scaleRows } = await supabase
    .from("three_sixty_rating_scale_options")
    .select("scale_code")
    .is("deleted_at", null);
  const scaleCodes = [...new Set((scaleRows ?? []).map((r) => r.scale_code))].sort();

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px", maxWidth: 720 }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!canCreate ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      ) : scaleCodes.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNoScale")}</p>
      ) : (
        <ThreeSixtyNewCycleForm scaleCodes={scaleCodes} />
      )}
    </div>
  );
}
