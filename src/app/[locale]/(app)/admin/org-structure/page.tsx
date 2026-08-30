import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { OrgStructureChartImage } from "@/components/OrgStructureChartImage";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx.
//
// 2026-08-30: this page used to generate the org chart from
// `org_structure_positions` and also carried the whole builder — levels, the
// setup wizard, the Excel import, the positions list. All of that is gone,
// asked for directly: "أرغب بحذف المحتوى كاملا واستبداله بصورة png or jpg
// قابلة للتكبير ونربط كل ما يتعلق بالمناصب والتسكين والصلاحيات بصفحة
// الوحدات التنظيمية".
//
// What is NOT gone is the data. `org_structure_levels` and
// `org_structure_positions` still back every unit's level and its positions;
// their screens moved to /org-units rather than being deleted with the chart,
// which is why this page links there instead of simply dropping them.
export default async function OrgStructurePage() {
  const t = await getTranslations("OrgStructurePage");
  const supabase = await createClient();

  const [{ data: permissionRows }, { data: chart }] = await Promise.all([
    supabase.rpc("get_my_permissions"),
    supabase.from("org_structure_chart").select("image_url").maybeSingle(),
  ]);

  const orgStructureLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "orgStructure"
    )?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(orgStructureLevel, "prepare");

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="administration" current="admin/org-structure" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("chartSubtitle")}</p>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <OrgStructureChartImage imageUrl={(chart?.image_url as string | null) ?? null} canEdit={canEdit} />

      {/* The features that used to live here now live beside the units they
          describe, so this says where they went rather than leaving a reader
          to hunt for them. */}
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 18, lineHeight: 1.9 }}>
        {t("chartMovedNote")}{" "}
        <Link href="/org-units" style={{ color: "var(--sru-purple)", fontWeight: 600 }}>
          {t("chartMovedLink")}
        </Link>
      </p>
    </div>
  );
}
