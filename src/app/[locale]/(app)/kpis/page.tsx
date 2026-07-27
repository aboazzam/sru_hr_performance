import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";

interface KpiRow {
  id: string;
  target_value: number;
  actual_value: number | null;
  unit_ar: string;
  weight: number | null;
  status: string;
  custom_title_ar: string | null;
  kpi_library: { title_ar: string } | null;
  evaluation_cycles: { name_ar: string } | null;
}

interface TeamKpiRow extends KpiRow {
  profiles: { full_name_ar: string; employee_number: string } | null;
}

function achievementPercent(row: { target_value: number; actual_value: number | null }): number | null {
  if (row.actual_value == null || row.target_value === 0) return null;
  return Math.round((row.actual_value / row.target_value) * 100);
}

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function KpisPage() {
  const t = await getTranslations("KpisPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Self-row is always visible on profiles regardless of VPRA (profiles_select).
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const myProfileId = myProfile?.id ?? null;

  // Deliberately filtered to `employee_id = my own profile id`, not left to
  // kpis_select's RLS alone (same discipline as /evaluations/mine and
  // /goals's own self-service pages) — the RLS OR-branches
  // (check_vpra('kpiAssignment','prepare',...) / is_my_direct_report()) are
  // for the team section below, not "show me MY OWN cascaded KPIs."
  const { data: myKpisData } = myProfileId
    ? await supabase
        .from("kpis")
        .select("id, target_value, actual_value, unit_ar, weight, status, custom_title_ar, kpi_library(title_ar), evaluation_cycles(name_ar)")
        .eq("employee_id", myProfileId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };
  const myKpis = (myKpisData ?? []) as unknown as KpiRow[];

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canAssign = hasVpraAccess(permissions.kpiAssignment ?? "none", "prepare");
  const canManageLibrary = hasVpraAccess(permissions.kpiLibrary ?? "none", "prepare");

  // Direct reports only (profiles.supervisor_id), same discipline as
  // /evaluations/team — never left to kpis_select's broader RLS branches,
  // which would show every KPI an approve/recommend-level role can see, not
  // just the caller's own real direct reports.
  let teamKpis: TeamKpiRow[] = [];
  if (canAssign && myProfileId) {
    const { data: reports } = await supabase
      .from("profiles")
      .select("id")
      .eq("supervisor_id", myProfileId)
      .is("deleted_at", null);
    const reportIds = (reports ?? []).map((r) => r.id);

    if (reportIds.length > 0) {
      const { data: teamKpisData } = await supabase
        .from("kpis")
        .select(
          "id, target_value, actual_value, unit_ar, weight, status, custom_title_ar, kpi_library(title_ar), evaluation_cycles(name_ar), profiles(full_name_ar, employee_number)"
        )
        .in("employee_id", reportIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      teamKpis = (teamKpisData ?? []) as unknown as TeamKpiRow[];
    }
  }

  const columns = (
    <>
      <th>{t("columnTitle")}</th>
      <th>{t("columnCycle")}</th>
      <th>{t("columnTarget")}</th>
      <th>{t("columnActual")}</th>
      <th>{t("columnAchievement")}</th>
      <th>{t("columnWeight")}</th>
      <th>{t("columnStatus")}</th>
    </>
  );

  function kpiCells(row: KpiRow) {
    const achievement = achievementPercent(row);
    return (
      <>
        <td>{row.kpi_library?.title_ar ?? row.custom_title_ar}</td>
        <td>{row.evaluation_cycles?.name_ar ?? "—"}</td>
        <td>
          {row.target_value} {row.unit_ar}
        </td>
        <td>{row.actual_value != null ? `${row.actual_value} ${row.unit_ar}` : t("notReportedYet")}</td>
        <td>{achievement != null ? `${achievement}%` : "—"}</td>
        <td>{row.weight != null ? `${row.weight}%` : "—"}</td>
        <td>{row.status}</td>
      </>
    );
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canAssign && (
            <Link href="/kpis/assign" className="sru-btn sru-btn-primary">
              {t("assignButton")}
            </Link>
          )}
          {canManageLibrary && (
            <Link href="/kpis/library" className="sru-btn">
              {t("libraryButton")}
            </Link>
          )}
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
        {t("myHeading")}
      </h2>
      {myKpis.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 32 }}>{t("myEmpty")}</p>
      ) : (
        <div className="sru-card" style={{ marginBottom: 32 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>{columns}</tr>
              </thead>
              <tbody>
                {myKpis.map((row) => (
                  <tr key={row.id}>{kpiCells(row)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canAssign && (
        <>
          <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 12 }}>
            {t("teamHeading")}
          </h2>
          {teamKpis.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("teamEmpty")}</p>
          ) : (
            <div className="sru-card">
              <div className="table-scroll">
                <table className="admin-matrix">
                  <thead>
                    <tr>
                      <th>{t("columnEmployee")}</th>
                      {columns}
                    </tr>
                  </thead>
                  <tbody>
                    {teamKpis.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.profiles?.employee_number} — {row.profiles?.full_name_ar}
                        </td>
                        {kpiCells(row)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
