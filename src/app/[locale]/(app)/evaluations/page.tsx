import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AddEvaluationCycleButton } from "@/components/AddEvaluationCycleButton";
import { EvaluationCycleRow, type EvaluationCycleRowData } from "@/components/EvaluationCycleRow";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import type { Locale } from "@/i18n/config";
import { getDisplayTimezone } from "@/lib/systemSettings";
import { cycleDependentTables, summariseCycleScoring, todayInTimezone } from "@/lib/evaluationCycle";
import type { EvaluationCycleType } from "./cycles/new/actions";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EvaluationCyclesPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("EvaluationCyclesPage");
  const tType = await getTranslations("NewEvaluationCyclePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = Object.fromEntries(
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).map((row) => [row.process_area, row.vpra_level])
  ) as Partial<Record<ProcessArea, VpraLevel>>;
  // Mirrors evaluation_cycles_insert/update's own RLS bar
  // (check_vpra_global('evaluation','approve') — ceo/hr_admin/super_admin
  // today). Hiding the controls is presentation; Postgres stays the gate.
  const canManageCycles = hasVpraAccess(permissions.evaluation ?? "none", "approve");

  // RLS-scoped to the caller (evaluation_cycles_select:
  // check_vpra('evaluation','view')) — every role holding any grant on
  // 'evaluation' (which is most of them) sees the full cycle list, since
  // cycles are university-wide metadata, not per-employee/org-unit scoped.
  const { data } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, name_en, cycle_type, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const cycles = data as Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    cycle_type: EvaluationCycleType;
    start_date: string;
    end_date: string;
  }> | null;

  // How many real records depend on each cycle, across every table with a
  // cycle_id FK. One small query per table (10 total, each returning just
  // the cycle_id column) rather than 10 x N per-cycle counts — the delete
  // guard and this column then read the same numbers. All RLS-scoped, so a
  // caller only ever counts what they can genuinely see.
  const usageByCycle = new Map<string, number>();
  if (cycles && cycles.length > 0) {
    const cycleIds = cycles.map((c) => c.id);
    await Promise.all(
      cycleDependentTables.map(async (table) => {
        const { data: rows } = await supabase
          .from(table)
          .select("cycle_id")
          .in("cycle_id", cycleIds)
          .is("deleted_at", null);
        for (const row of rows ?? []) {
          usageByCycle.set(row.cycle_id, (usageByCycle.get(row.cycle_id) ?? 0) + 1);
        }
      })
    );
  }

  // Scoring progress per cycle. Two reads, both RLS-scoped like everything
  // else here, so a caller only ever counts what they can genuinely see.
  const cycleIdList = (cycles ?? []).map((c) => c.id);
  const { data: cycleEvaluations } =
    cycleIdList.length > 0
      ? await supabase.from("evaluations").select("id, cycle_id").in("cycle_id", cycleIdList).is("deleted_at", null)
      : { data: [] };
  const evaluationIds = ((cycleEvaluations ?? []) as { id: string }[]).map((e) => e.id);
  const { data: cycleScores } =
    evaluationIds.length > 0
      ? await supabase
          .from("evaluation_scores")
          .select("evaluation_id, score")
          .in("evaluation_id", evaluationIds)
          .is("deleted_at", null)
      : { data: [] };
  const scoringByCycle = summariseCycleScoring(
    (cycleEvaluations ?? []) as { id: string; cycle_id: string }[],
    (cycleScores ?? []) as { evaluation_id: string; score: number | null }[]
  );

  // "Today" for the derived status column, in the configured display
  // timezone rather than the server's — the same setting the user-activity
  // and promotions-history screens already respect.
  const digits = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US";
  const timezone = await getDisplayTimezone(supabase);
  const today = todayInTimezone(timezone);

  const typeLabels = {
    cycleTypeAcademic: tType("cycleTypeAcademic"),
    cycleTypeCalendar: tType("cycleTypeCalendar"),
    cycleTypeFiscal: tType("cycleTypeFiscal"),
  };

  const rows: EvaluationCycleRowData[] = (cycles ?? []).map((cycle) => ({
    id: cycle.id,
    nameAr: cycle.name_ar,
    nameEn: cycle.name_en,
    cycleType: cycle.cycle_type,
    startDate: cycle.start_date,
    endDate: cycle.end_date,
    usageCount: usageByCycle.get(cycle.id) ?? 0,
  }));

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
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        {/* One button only (2026-08-25 request). "My evaluations", "my team"
            and "needs my review" moved off this screen: they are things you do
            INSIDE a cycle, and listing them here asked the reader to choose a
            view before choosing a period. */}
        <div className="sru-actionbar no-print">
          {canManageCycles && <AddEvaluationCycleButton locale={locale} />}
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {rows.length === 0 ? (
        <div>
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
          {/* Zero cycles is not a cosmetic empty state: `cycle_id` is NOT
              NULL on promotions/rewards/calibration/goals/BAU tasks/targets,
              so those modules cannot be used at all until one exists. Say so
              here, where the fix is one click away. */}
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8, lineHeight: 1.9 }}>
            {canManageCycles ? t("emptyBlocksModulesManager") : t("emptyBlocksModules")}
          </p>
        </div>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnType")}</th>
                  <th>{t("columnStartDate")}</th>
                  <th>{t("columnEndDate")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnUsage")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cycle) => (
                  <EvaluationCycleRow
                    key={cycle.id}
                    cycle={cycle}
                    canManage={canManageCycles}
                    today={today}
                    typeLabels={typeLabels}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 className="sru-title" style={{ fontSize: 15 }}>
            {t("metricsHeading")}
          </h2>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: "4px 0 12px", lineHeight: 1.8 }}>
            {t("metricsNote")}
          </p>
          {/* One card per cycle rather than one figure for all of them: an
              average across two different periods answers nothing. */}
          {rows.map((row) => {
            const s = scoringByCycle.get(row.id) ?? { total: 0, scored: 0, remaining: 0, averageScore: null };
            return (
              <div key={row.id} className="sru-card" style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{row.nameAr}</p>
                <div className="sru-home-mine">
                  <span className="sru-home-tile">
                    <span className="sru-home-tile-label">{t("metricScored")}</span>
                    <strong>{s.scored.toLocaleString(digits)}</strong>
                  </span>
                  <span className="sru-home-tile">
                    <span className="sru-home-tile-label">{t("metricRemaining")}</span>
                    <strong>{s.remaining.toLocaleString(digits)}</strong>
                  </span>
                  <span className="sru-home-tile">
                    <span className="sru-home-tile-label">{t("metricAverage")}</span>
                    {/* Never 0 when nothing was scored — an untouched cycle
                        must not read as a cycle that scored zero. */}
                    <strong>{s.averageScore == null ? t("metricNoAverage") : `${s.averageScore.toLocaleString(digits)}%`}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
