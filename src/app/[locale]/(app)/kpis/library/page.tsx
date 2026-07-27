import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/PrintButton";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function KpiLibraryPage() {
  const t = await getTranslations("KpiLibraryPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (kpi_library_select: check_vpra('kpiLibrary',
  // 'view', org_unit_id)) — strategy_admin (scope 'all') sees every entry,
  // including undistributed (org_unit_id NULL) drafts; an org_unit-scoped
  // role only sees entries actually distributed to their own department.
  // org_unit_id is a single, nullable FK -> org_units, so the embed returns
  // a single object or null, not an array — verified against the REST API
  // before writing this, same habit as career_path/salary_scale/promotions.
  const { data } = await supabase
    .from("kpi_library")
    .select("id, title_ar, title_en, description_ar, default_weight, unit_ar, org_units(name_ar)")
    .is("deleted_at", null)
    .order("title_ar");

  const kpis = data as unknown as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    default_weight: number | null;
    unit_ar: string;
    org_units: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/kpis/library/new" className="sru-btn sru-btn-primary">
            {t("addButton")}
          </Link>
          <Link href="/kpis/assign" className="sru-btn">
            {t("assignButton")}
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!kpis || kpis.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnUnit")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnDefaultWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((kpi) => (
                  <tr key={kpi.id}>
                    <td>
                      {kpi.title_ar}
                      {kpi.description_ar && (
                        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>{kpi.description_ar}</p>
                      )}
                    </td>
                    <td>{kpi.unit_ar}</td>
                    <td>{kpi.org_units?.name_ar ?? t("notDistributed")}</td>
                    <td>{kpi.default_weight != null ? `${kpi.default_weight}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
