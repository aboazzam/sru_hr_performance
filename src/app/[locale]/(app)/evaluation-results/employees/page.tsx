import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GroupTabs } from "@/components/layout/GroupTabs";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { cycleStatus, todayInTimezone, type EvaluationMethod, type MethodWeights } from "@/lib/evaluationCycle";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { resolveEvaluationResultsForCycle } from "@/lib/evaluationResult";
import { EvaluationResultsTable, type EvaluationResultRowView } from "@/components/EvaluationResultsTable";

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

// "نتائج التقييم" module (2026-09-07) — the employee-results tab: a
// searchable/sortable table of every employee's official (eval_type=
// 'supervisor') weighted result for one cycle, reusing the exact same
// resolveEvaluationResultsForCycle/dual-access-path design as the dashboard
// (/evaluation-results). Row-links to the existing /evaluations/[id] detail
// page rather than duplicating it.
export default async function EvaluationResultsEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>;
}) {
  const { cycleId: cycleIdParam } = await searchParams;
  const t = await getTranslations("EvaluationResultsEmployeesPage");
  const tDashboard = await getTranslations("EvaluationResultsDashboardPage");
  const supabase = await createClient();

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
  const hasAccess = canViewBroad || hasTeam;

  let rows: EvaluationResultRowView[] = [];
  if (selectedCycle && hasAccess) {
    const cycleWeights: MethodWeights = {
      activities: Number(selectedCycle.weight_activities),
      competencies: Number(selectedCycle.weight_competencies),
      bau: Number(selectedCycle.weight_bau),
      feedback360: Number(selectedCycle.weight_feedback_360),
    };
    // If the caller holds the broad grant, its query already returns every
    // row their `evaluation`/`threeSixty` permissions allow — which, thanks
    // to evaluations_select's own is_my_direct_report() branch, already
    // includes their direct reports too. Only when they lack the broad
    // grant do we fall back to the explicitly team-scoped query.
    const results = canViewBroad
      ? await resolveEvaluationResultsForCycle(supabase, selectedCycle.id, cycleWeights)
      : await resolveEvaluationResultsForCycle(supabase, selectedCycle.id, cycleWeights, { employeeIds: teamEmployeeIds });
    rows = results.map((result) => ({
      evaluationId: result.evaluationId,
      employeeNumber: result.employeeNumber,
      employeeName: result.employeeName,
      orgUnitName: result.orgUnitName,
      score: result.score,
      bandId: result.band?.id ?? null,
      bandLabel: result.band?.labelAr ?? null,
      methodScores: result.methodScores,
    }));
  }

  const methodLabels: Record<EvaluationMethod, string> = {
    activities: tDashboard("methodActivities"),
    competencies: tDashboard("methodCompetencies"),
    bau: tDashboard("methodBau"),
    feedback360: tDashboard("method360"),
  };

  const now = new Date();
  const printedOn = now.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: timezone, day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <GroupTabs groupKey="evaluationResults" current="evaluation-results/employees" />
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tDashboard("noCyclesEmpty")}</p>
      ) : (
        <>
          <form
            method="get"
            className="no-print"
            style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}
          >
            <div>
              <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>{tDashboard("cycleLabel")}</label>
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
              {tDashboard("applyButton")}
            </button>
          </form>

          {!hasAccess ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{tDashboard("noAccessMessage")}</p>
          ) : (
            <>
              <EvaluationResultsTable
                results={rows}
                methodLabels={methodLabels}
                cycleName={selectedCycle?.name_ar ?? "—"}
                printedOn={printedOn}
              />
              <p style={{ marginTop: 20 }} className="no-print">
                <Link
                  href={selectedCycleId ? `/evaluation-results?cycleId=${selectedCycleId}` : "/evaluation-results"}
                  className="sru-btn sru-btn-slim"
                >
                  {t("backToDashboardLink")}
                </Link>
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
