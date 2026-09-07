import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { cycleStatus, todayInTimezone, type MethodWeights } from "@/lib/evaluationCycle";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { resolveEvaluationResultsForCycle, type EmployeeCycleResultRow } from "@/lib/evaluationResult";
import { RATING_BANDS } from "@/lib/ratingBands";

interface CycleOption {
  id: string;
  name_ar: string;
  start_date: string;
  end_date: string;
  weight_activities: number;
  weight_competencies: number;
  weight_bau: number;
  weight_feedback_360: number;
}

interface ResultsSummary {
  total: number;
  scoredCount: number;
  average: number | null;
  bandCounts: Map<string, number>;
}

function summarize(rows: EmployeeCycleResultRow[]): ResultsSummary {
  const scored = rows.filter((row): row is EmployeeCycleResultRow & { score: number } => row.score != null);
  const average = scored.length > 0 ? scored.reduce((sum, row) => sum + row.score, 0) / scored.length : null;
  const bandCounts = new Map<string, number>();
  for (const row of scored) {
    if (!row.band) continue;
    bandCounts.set(row.band.id, (bandCounts.get(row.band.id) ?? 0) + 1);
  }
  return { total: rows.length, scoredCount: scored.length, average, bandCounts };
}

interface OrgUnitBreakdownRow {
  key: string;
  name: string;
  count: number;
  average: number;
}

function breakdownByOrgUnit(rows: EmployeeCycleResultRow[], unknownLabel: string): OrgUnitBreakdownRow[] {
  const map = new Map<string, { name: string; scores: number[] }>();
  for (const row of rows) {
    if (row.score == null) continue;
    const key = row.orgUnitId ?? "—";
    const entry = map.get(key) ?? { name: row.orgUnitName ?? unknownLabel, scores: [] };
    entry.scores.push(row.score);
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, entry]) => ({
      key,
      name: entry.name,
      count: entry.scores.length,
      average: entry.scores.reduce((sum, value) => sum + value, 0) / entry.scores.length,
    }))
    .sort((a, b) => b.average - a.average);
}

// "نتائج التقييم" module (2026-09-07) — the dashboard tab. Aggregates the
// SAME weighted-result computation `/evaluations/[id]/page.tsx` already runs
// for one evaluation (src/lib/evaluationResult.ts), across every employee in
// a chosen cycle. Reachable by every logged-in user (no page-level gate —
// same "reports"/"kpis"/threeSixty precedent in navItems.ts), but its
// content is composed per caller from two independent access paths:
// `evaluationResultsReports>=view` for the broad, org-wide section, and
// having real direct reports (`is_my_direct_report()`, the same relationship
// `/evaluations/team/page.tsx` already relies on) for "نتائج فريقي" — a
// manager needs neither role_permissions grant to see their own team here.
export default async function EvaluationResultsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const { cycleId: cycleIdParam } = await searchParams;
  const t = await getTranslations("EvaluationResultsDashboardPage");
  const supabase = await createClient();

  // RLS-scoped (evaluation_cycles_select: check_vpra('evaluation','view'),
  // no org-unit argument -- a pre-existing, already-documented gap noted on
  // /evaluations/[id]: an org_unit-scoped role never sees any cycle row
  // here, only scope_type='all' roles can. Inherited as-is; a caller in that
  // position simply sees this page's "no cycles" empty state.
  const { data: cyclesData } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date, weight_activities, weight_competencies, weight_bau, weight_feedback_360")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const cycles = (cyclesData ?? []) as CycleOption[];

  const timezone = await getDisplayTimezone(supabase);
  const today = todayInTimezone(timezone);
  const activeCycle = cycles.find((cycle) => cycleStatus(cycle.start_date, cycle.end_date, today) === "active");
  const defaultCycleId = activeCycle?.id ?? cycles[0]?.id ?? null;
  const selectedCycleId = cycleIdParam && cycles.some((cycle) => cycle.id === cycleIdParam) ? cycleIdParam : defaultCycleId;
  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  const canViewBroad = hasVpraAccess(permissions.evaluationResultsReports ?? "none", "view");

  // Same direct-reports lookup /evaluations/team/page.tsx already uses --
  // this is what authorizes the "نتائج فريقي" section, independent of any
  // role_permissions grant (the relationship itself is the authorization
  // fact, same trust model as goals/bau_tasks/evaluations elsewhere).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  const { data: reportsData } = myProfile
    ? await supabase.from("profiles").select("id").eq("supervisor_id", myProfile.id).is("deleted_at", null)
    : { data: null };
  const teamEmployeeIds = (reportsData ?? []).map((row) => row.id);
  const hasTeam = teamEmployeeIds.length > 0;

  let broadRows: EmployeeCycleResultRow[] = [];
  let teamRows: EmployeeCycleResultRow[] = [];
  if (selectedCycle && (canViewBroad || hasTeam)) {
    const cycleWeights: MethodWeights = {
      activities: Number(selectedCycle.weight_activities),
      competencies: Number(selectedCycle.weight_competencies),
      bau: Number(selectedCycle.weight_bau),
      feedback360: Number(selectedCycle.weight_feedback_360),
    };
    const [broad, team] = await Promise.all([
      canViewBroad ? resolveEvaluationResultsForCycle(supabase, selectedCycle.id, cycleWeights) : Promise.resolve([]),
      hasTeam
        ? resolveEvaluationResultsForCycle(supabase, selectedCycle.id, cycleWeights, { employeeIds: teamEmployeeIds })
        : Promise.resolve([]),
    ]);
    broadRows = broad;
    teamRows = team;
  }

  const broadSummary = summarize(broadRows);
  const teamSummary = summarize(teamRows);
  const orgUnitBreakdown = breakdownByOrgUnit(broadRows, t("orgUnitUnknown"));

  const cardStyle: React.CSSProperties = { padding: 16, minWidth: 180 };
  const numberStyle: React.CSSProperties = { fontSize: 23, fontWeight: 800, color: "var(--sru-purple)" };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--sru-muted)" };

  const employeesLink = selectedCycleId
    ? `/evaluation-results/employees?cycleId=${selectedCycleId}`
    : "/evaluation-results/employees";

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="evaluationResults" current="evaluation-results" />
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>{t("subtitle")}</p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noCyclesEmpty")}</p>
      ) : (
        <>
          <form
            method="get"
            className="no-print"
            style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}
          >
            <div>
              <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>{t("cycleLabel")}</label>
              <select
                name="cycleId"
                defaultValue={selectedCycleId ?? ""}
                style={{ padding: "8px 10px", borderRadius: "var(--sru-radius)", border: "1px solid var(--sru-border)", minWidth: 220 }}
              >
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name_ar}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="sru-btn sru-btn-primary">
              {t("applyButton")}
            </button>
          </form>

          {!canViewBroad && !hasTeam ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noAccessMessage")}</p>
          ) : (
            <>
              {canViewBroad && (
                <section style={{ marginBottom: 32 }}>
                  <h2 className="sru-title" style={{ fontSize: 16, marginBottom: 8 }}>
                    {t("broadHeading")}
                  </h2>
                  <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 14, lineHeight: 1.8 }}>{t("broadGrantNote")}</p>
                  {broadRows.length === 0 ? (
                    <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("broadEmpty")}</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
                        <div className="sru-card" style={cardStyle}>
                          <div style={numberStyle}>{broadSummary.total}</div>
                          <div style={labelStyle}>{t("totalEvaluatedLabel")}</div>
                        </div>
                        <div className="sru-card" style={cardStyle}>
                          <div style={numberStyle}>{broadSummary.average != null ? `${broadSummary.average.toFixed(1)}%` : "—"}</div>
                          <div style={labelStyle}>{t("averageScoreLabel")}</div>
                        </div>
                        <div className="sru-card" style={cardStyle}>
                          <div style={numberStyle}>
                            {broadSummary.scoredCount}/{broadSummary.total}
                          </div>
                          <div style={labelStyle}>{t("scoredCountLabel")}</div>
                        </div>
                      </div>

                      <h3 className="sru-title" style={{ fontSize: 14, marginBottom: 10 }}>
                        {t("distributionHeading")}
                      </h3>
                      <div className="sru-card" style={{ marginBottom: 24, padding: 16 }}>
                        {broadSummary.scoredCount === 0 ? (
                          <p style={{ color: "var(--sru-muted)", fontSize: 12.5, margin: 0 }}>{t("distributionEmpty")}</p>
                        ) : (
                          RATING_BANDS.map((band) => {
                            const count = broadSummary.bandCounts.get(band.id) ?? 0;
                            const pct = Math.round((count / broadSummary.scoredCount) * 100);
                            return (
                              <div key={band.id} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                                  <span>{band.labelAr}</span>
                                  <span style={{ color: "var(--sru-muted)" }}>
                                    {count} ({pct}%)
                                  </span>
                                </div>
                                <div style={{ background: "var(--sru-purple-light)", borderRadius: "var(--sru-radius)", height: 8, overflow: "hidden" }}>
                                  <div className={`sru-rating-bar-fill is-${band.id}`} style={{ width: `${pct}%`, height: "100%" }} />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <h3 className="sru-title" style={{ fontSize: 14, marginBottom: 10 }}>
                        {t("orgUnitBreakdownHeading")}
                      </h3>
                      <div className="sru-card">
                        <div className="table-scroll">
                          <table className="admin-matrix">
                            <thead>
                              <tr>
                                <th>{t("orgUnitColumn")}</th>
                                <th>{t("orgUnitCountColumn")}</th>
                                <th>{t("orgUnitAvgColumn")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orgUnitBreakdown.map((row) => (
                                <tr key={row.key}>
                                  <td>{row.name}</td>
                                  <td>{row.count}</td>
                                  <td>{row.average.toFixed(1)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              )}

              {hasTeam && (
                <section style={{ marginBottom: 32 }}>
                  <h2 className="sru-title" style={{ fontSize: 16, marginBottom: 12 }}>
                    {t("teamHeading")}
                  </h2>
                  {teamRows.length === 0 ? (
                    <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("teamEmpty")}</p>
                  ) : (
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div className="sru-card" style={cardStyle}>
                        <div style={numberStyle}>{teamSummary.total}</div>
                        <div style={labelStyle}>{t("totalEvaluatedLabel")}</div>
                      </div>
                      <div className="sru-card" style={cardStyle}>
                        <div style={numberStyle}>{teamSummary.average != null ? `${teamSummary.average.toFixed(1)}%` : "—"}</div>
                        <div style={labelStyle}>{t("averageScoreLabel")}</div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              <p>
                <Link href={employeesLink} className="sru-btn sru-btn-primary sru-btn-slim">
                  {t("viewEmployeesLink")}
                </Link>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
