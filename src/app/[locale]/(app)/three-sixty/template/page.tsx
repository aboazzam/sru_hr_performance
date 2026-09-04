import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { ThreeSixtyTemplateImportButton } from "@/components/ThreeSixtyTemplateImportButton";
import { ThreeSixtyTemplateExportButtons } from "@/components/ThreeSixtyTemplateExportButtons";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

export default async function ThreeSixtyTemplatePage() {
  const t = await getTranslations("ThreeSixtyTemplatePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [
      row.process_area,
      row.vpra_level,
    ])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canManage = hasVpraAccess(permissions.threeSixty ?? "none", "prepare");

  if (!canManage) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <GroupTabs groupKey="threeSixty" current="three-sixty/template" />
        <h1 className="sru-title" style={{ fontSize: 20 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 20 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  const [{ data: raterGroups }, { data: scaleOptions }, { data: competencies }, { data: items }] = await Promise.all([
    supabase
      .from("three_sixty_rater_groups")
      .select("id, relationship_code, name_ar, group_weight_pct, min_raters_in_group, max_raters_in_group, shown_separately, employee_may_nominate")
      .is("deleted_at", null)
      .order("relationship_code"),
    supabase
      .from("three_sixty_rating_scale_options")
      .select("id, scale_code, option_code, label_ar, numeric_value, counted_in_score")
      .is("deleted_at", null)
      .order("scale_code")
      .order("numeric_value"),
    supabase
      .from("three_sixty_competencies")
      .select("id, competency_code, name_ar, weight_pct, applies_to")
      .is("deleted_at", null)
      .order("competency_code"),
    supabase
      .from("three_sixty_items")
      .select("id, item_code, text_ar, item_type, rater_groups, scale_code, display_order, three_sixty_competencies(name_ar)")
      .is("deleted_at", null)
      .order("display_order"),
  ]);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="threeSixty" current="three-sixty/template" />
      <div
        className="no-print"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div className="sru-actionbar no-print">
          <ThreeSixtyTemplateExportButtons />
          <ThreeSixtyTemplateImportButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("raterGroupsHeading", { count: raterGroups?.length ?? 0 })}</h2>
      <div className="sru-card" style={{ marginBottom: 24 }}>
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>relationship_code</th>
                <th>name_ar</th>
                <th>min–max</th>
                <th>shown_separately</th>
                <th>employee_may_nominate</th>
              </tr>
            </thead>
            <tbody>
              {(raterGroups ?? []).map((g) => (
                <tr key={g.id}>
                  <td style={{ fontFamily: "monospace" }}>{g.relationship_code}</td>
                  <td>{g.name_ar}</td>
                  <td>
                    {g.min_raters_in_group}–{g.max_raters_in_group ?? "∞"}
                  </td>
                  <td>{g.shown_separately ? "✓" : "—"}</td>
                  <td>{g.employee_may_nominate ? "✓" : "—"}</td>
                </tr>
              ))}
              {(!raterGroups || raterGroups.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("ratingScaleHeading", { count: scaleOptions?.length ?? 0 })}</h2>
      <div className="sru-card" style={{ marginBottom: 24 }}>
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>scale_code</th>
                <th>option_code</th>
                <th>label_ar</th>
                <th>numeric_value</th>
                <th>counted_in_score</th>
              </tr>
            </thead>
            <tbody>
              {(scaleOptions ?? []).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: "monospace" }}>{o.scale_code}</td>
                  <td style={{ fontFamily: "monospace" }}>{o.option_code}</td>
                  <td>{o.label_ar}</td>
                  <td>{o.numeric_value}</td>
                  <td>{o.counted_in_score ? "✓" : "—"}</td>
                </tr>
              ))}
              {(!scaleOptions || scaleOptions.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("competenciesHeading", { count: competencies?.length ?? 0 })}</h2>
      <div className="sru-card" style={{ marginBottom: 24 }}>
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>competency_code</th>
                <th>name_ar</th>
                <th>weight_pct</th>
                <th>applies_to</th>
              </tr>
            </thead>
            <tbody>
              {(competencies ?? []).map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: "monospace" }}>{c.competency_code}</td>
                  <td>{c.name_ar}</td>
                  <td>{c.weight_pct ?? "—"}</td>
                  <td>{c.applies_to ?? "—"}</td>
                </tr>
              ))}
              {(!competencies || competencies.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("itemsHeading", { count: items?.length ?? 0 })}</h2>
      <div className="sru-card">
        <div className="table-scroll">
          <table className="admin-matrix">
            <thead>
              <tr>
                <th>item_code</th>
                <th>{t("columnCompetency")}</th>
                <th>text_ar</th>
                <th>item_type</th>
                <th>rater_groups</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const competency = item.three_sixty_competencies as unknown as { name_ar: string } | null;
                return (
                  <tr key={item.id}>
                    <td style={{ fontFamily: "monospace" }}>{item.item_code}</td>
                    <td>{competency?.name_ar ?? "—"}</td>
                    <td>{item.text_ar}</td>
                    <td>{item.item_type}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{(item.rater_groups as string[]).join(", ")}</td>
                  </tr>
                );
              })}
              {(!items || items.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--sru-muted)", textAlign: "center" }}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
