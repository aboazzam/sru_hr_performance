import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { AddOrgStructureLevelForm } from "@/components/AddOrgStructureLevelForm";
import { AddOrgStructurePositionForm } from "@/components/AddOrgStructurePositionForm";
import { OrgStructureLevelCard } from "@/components/OrgStructureLevelCard";
import { OrgStructurePositionMiniRow } from "@/components/OrgStructurePositionMiniRow";

// Auth is enforced centrally by (app)/layout.tsx; real write authorization
// is org_structure_levels/positions' own RLS (check_vpra_global('orgStructure',
// 'approve'), hr_admin-only per the seeded matrix — 20260722000004). This
// page itself only requires 'view' to be visible at all (enforced by the
// SELECT policies), matching /admin's own display-only gate on the link here.
export default async function OrgStructurePage() {
  const t = await getTranslations("OrgStructurePage");
  const supabase = await createClient();

  const { data: levelsData } = await supabase
    .from("org_structure_levels")
    .select("id, name_ar, name_en, level_order")
    .is("deleted_at", null)
    .order("level_order", { ascending: true });

  const levels = (levelsData ?? []) as Array<{ id: string; name_ar: string; name_en: string | null; level_order: number }>;

  const { data: positionsData } = await supabase
    .from("org_structure_positions")
    .select("id, level_id, parent_id, name_ar, name_en")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const positions = (positionsData ?? []) as Array<{
    id: string;
    level_id: string;
    parent_id: string | null;
    name_ar: string;
    name_en: string | null;
  }>;
  const positionNameById = new Map(positions.map((p) => [p.id, p.name_ar]));

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <Link href="/admin/org-structure/staffing" className="sru-btn">
          {t("staffingLink")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <section style={{ marginBottom: 30, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <AddOrgStructureLevelForm />
        <AddOrgStructurePositionForm levels={levels} positions={positions} />
      </section>

      <section>
        <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
          {t("levelsHeading")}
        </h2>
        {levels.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noLevels")}</p>
        ) : (
          levels.map((level) => {
            const levelPositions = positions.filter((p) => p.level_id === level.id);
            return (
              <OrgStructureLevelCard
                key={level.id}
                levelId={level.id}
                levelOrder={level.level_order}
                initialNameAr={level.name_ar}
                initialNameEn={level.name_en}
              >
                {levelPositions.length === 0 ? (
                  <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noPositions")}</p>
                ) : (
                  <div>
                    {levelPositions.map((position) => (
                      <OrgStructurePositionMiniRow
                        key={position.id}
                        positionId={position.id}
                        initialNameAr={position.name_ar}
                        initialNameEn={position.name_en}
                        parentLabel={
                          position.parent_id ? `${t("parentLabel")}: ${positionNameById.get(position.parent_id) ?? "—"}` : t("rootChip")
                        }
                      />
                    ))}
                  </div>
                )}
              </OrgStructureLevelCard>
            );
          })
        )}
      </section>
    </div>
  );
}
