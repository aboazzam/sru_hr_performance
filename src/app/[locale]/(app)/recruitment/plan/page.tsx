import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
//
// Deliberately a scaffold: the "التوظيف" module was requested as three tabs
// with its own permissions section, with each tab's own design to follow
// ("بمجرد تنتهي سنبدأ بتصميم كل تاب لوحده"). No `recruitment_plan` table
// exists yet and none is invented here — inventing a schema before the tab's
// shape is agreed is exactly what this project's no-fabricated-data
// discipline forbids. What IS real: the `recruitmentPlan` process area
// (20260804000001) and this page's gate on it, so access can already be
// granted/withheld through /admin before any content exists.
export default async function RecruitmentPlanPage() {
  const t = await getTranslations("RecruitmentPlanPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const level =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "recruitmentPlan"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(level, "view");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />
      <GroupTabs groupKey="recruitment" current="recruitment/plan" />

      {!canView ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 24 }}>{t("forbidden")}</p>
      ) : (
        <div className="sru-card" style={{ marginTop: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t("comingSoonTitle")}</p>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.9 }}>{t("comingSoonBody")}</p>
        </div>
      )}
    </div>
  );
}
