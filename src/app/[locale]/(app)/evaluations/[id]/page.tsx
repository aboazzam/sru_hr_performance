import { getTranslations } from "next-intl/server";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { createClient } from "@/lib/supabase/server";
import {
  evaluationMethods,
  resolveWeights,
  weightedCycleScore,
  type EvaluationMethod,
  type MethodWeights,
} from "@/lib/evaluationCycle";
import { Link } from "@/i18n/navigation";
import { evaluationStateLabels, evalTypeLabels, type EvaluationState, type EvalType } from "@/lib/vpra";
import { EvaluationStateAction } from "@/components/EvaluationStateAction";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EvaluationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("EvaluationDetailPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (evaluations_select: self-row OR
  // check_vpra('evaluation','recommend', org_unit_id) [manager/committee
  // org-unit oversight] OR is_my_direct_report() [direct supervisor]) — a
  // missing row and an RLS-blocked row look identical here on purpose,
  // same reasoning as the transitionEvaluation action itself.
  // profiles/evaluation_cycles are single, non-nullable FKs -> verified
  // single-object embed shape directly against the REST API with a real
  // temporary row before writing this.
  const { data: evaluation } = await supabase
    .from("evaluations")
    .select(
      "id, employee_id, cycle_id, state, eval_type, profiles(full_name_ar, employee_number, org_unit_id), evaluation_cycles(name_ar, weight_activities, weight_competencies, weight_bau, weight_feedback_360)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!evaluation) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorNotFound")}</p>
      </div>
    );
  }

  const employee = evaluation.profiles as unknown as {
    full_name_ar: string;
    employee_number: string;
  } | null;
  // `evaluation_cycles` can be null here even though evaluations_select
  // already let this row through -- evaluation_cycles_select is gated
  // independently (check_vpra('evaluation','view') with no org-unit
  // argument, a known pre-existing gap: an org_unit-scoped role can never
  // see ANY row there, only scope_type='all' roles can, documented since
  // migration 20260719000004). Found live via the new "needs my review"
  // queue crashing here for an org_unit-scoped manager -- null-safety
  // fixed here (not the underlying evaluation_cycles RLS gap, which stays
  // a separate, already-flagged follow-up).
  const cycle = evaluation.evaluation_cycles as unknown as {
    name_ar: string;
    weight_activities: number;
    weight_competencies: number;
    weight_bau: number;
    weight_feedback_360: number;
  } | null;
  const state = evaluation.state as EvaluationState;
  const evalType = evaluation.eval_type as EvalType;

  // bau_tasks are scoped by employee_id + cycle_id (not evaluation_id — that
  // table has no FK to evaluations); its own RLS (bauTasks) is independent of
  // evaluations' RLS, so a caller who can see this evaluation header may still
  // see zero rows here without separately clearing bauTasks' own bar — not a
  // bug, each table's RLS is evaluated on its own terms.
  const { data: bauTasksData } = await supabase
    .from("bau_tasks")
    .select("id, title_ar, weight, status")
    .eq("employee_id", evaluation.employee_id)
    .eq("cycle_id", evaluation.cycle_id)
    .is("deleted_at", null);

  const bauTasks = bauTasksData as Array<{
    id: string;
    title_ar: string;
    weight: number | null;
    status: string;
  }> | null;

  // Activities are assigned inside an initiative, not per cycle, so they are
  // matched by responsible employee. They became scorable in 20260828000001 —
  // before it their weight had nothing to weigh.
  const { data: activityData } = await supabase
    .from("initiative_activities")
    .select("id, title_ar")
    .eq("responsible_profile_id", evaluation.employee_id)
    .is("deleted_at", null)
    .order("title_ar");
  const activities = (activityData ?? []) as Array<{ id: string; title_ar: string }>;

  const { data: feedbackData } = await supabase
    .from("feedback_360")
    .select("id, evaluator_relation, comments, scores")
    .eq("cycle_id", evaluation.cycle_id)
    .eq("target_employee_id", evaluation.employee_id)
    .is("deleted_at", null);
  const feedback = (feedbackData ?? []) as Array<{ id: string; evaluator_relation: EvalType; comments: string | null }>;

  const { data: competencyData } = await supabase
    .from("competencies")
    .select("id, name_ar")
    .is("deleted_at", null)
    .order("name_ar");
  const competencies = (competencyData ?? []) as Array<{ id: string; name_ar: string }>;

  const { data: scoreData } = await supabase
    .from("evaluation_scores")
    .select("competency_id, goal_id, bau_task_id, activity_id, score")
    .eq("evaluation_id", evaluation.id)
    .is("deleted_at", null);
  const scores = (scoreData ?? []) as Array<{
    competency_id: string | null;
    goal_id: string | null;
    bau_task_id: string | null;
    activity_id: string | null;
    score: number | null;
  }>;
  const scoreByCompetency = new Map(scores.filter((x) => x.competency_id).map((x) => [x.competency_id as string, x.score]));
  const scoreByBauTask = new Map(scores.filter((x) => x.bau_task_id).map((x) => [x.bau_task_id as string, x.score]));
  const scoreByActivity = new Map(scores.filter((x) => x.activity_id).map((x) => [x.activity_id as string, x.score]));

  // Which distribution governs THIS employee: their department's own if it
  // has one, otherwise the cycle's — resolved through resolveWeights so every
  // screen answers the question identically.
  const employeeOrgUnitId =
    (evaluation.profiles as unknown as { org_unit_id: string | null } | null)?.org_unit_id ?? null;
  const { data: unitWeightRow } = employeeOrgUnitId
    ? await supabase
        .from("org_unit_evaluation_weights")
        .select("weight_activities, weight_competencies, weight_bau, weight_feedback_360")
        .eq("cycle_id", evaluation.cycle_id)
        .eq("org_unit_id", employeeOrgUnitId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  // The cycle-wide distribution (20260827000001), applied to this one
  // evaluation. A method with weight but nothing recorded is excluded and the
  // rest renormalised rather than counted as zero — see weightedCycleScore.
  const cycleWeights: MethodWeights = {
    activities: Number(cycle?.weight_activities ?? 0),
    competencies: Number(cycle?.weight_competencies ?? 0),
    bau: Number(cycle?.weight_bau ?? 0),
    feedback360: Number(cycle?.weight_feedback_360 ?? 0),
  };
  const unitWeights: MethodWeights | null = unitWeightRow
    ? {
        activities: Number(unitWeightRow.weight_activities),
        competencies: Number(unitWeightRow.weight_competencies),
        bau: Number(unitWeightRow.weight_bau),
        feedback360: Number(unitWeightRow.weight_feedback_360),
      }
    : null;
  const { weights, source: weightsSource } = resolveWeights(cycleWeights, unitWeights);
  const average = (values: Array<number | null | undefined>) => {
    const real = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return real.length === 0 ? null : real.reduce((sum, value) => sum + value, 0) / real.length;
  };
  const feedbackScores = feedback.map((row) => {
    const raw = (row as { scores?: { overall_score?: unknown } | null }).scores;
    const overall = raw && typeof raw === "object" ? (raw as { overall_score?: unknown }).overall_score : null;
    return typeof overall === "number" ? overall : null;
  });
  const weighted = weightedCycleScore(weights, {
    activities: average([...scoreByActivity.values()]),
    competencies: average([...scoreByCompetency.values()]),
    bau: average([...scoreByBauTask.values()]),
    feedback360: average(feedbackScores),
  });
  const methodLabel: Record<EvaluationMethod, string> = {
    activities: t("methodActivities"),
    competencies: t("methodCompetencies"),
    bau: t("methodBau"),
    feedback360: t("method360"),
  };

  const editButton = (method: string) => (
    <div style={{ marginBottom: 12 }}>
      <Link href={`/evaluations/${evaluation.id}/scores?method=${method}`} className="sru-btn sru-btn-primary sru-btn-slim">
        {t("editEvaluation")}
      </Link>
    </div>
  );

  const simpleTable = (
    head: string[],
    rows: Array<Array<string | number | null>>,
    empty: string
  ) =>
    rows.length === 0 ? (
      <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{empty}</p>
    ) : (
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((c, j) => (
                  <td key={j}>{c ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const methodTabs: ProfileTab[] = [
    {
      id: "activities",
      label: t("tabActivities"),
      content: (
        <>
          {editButton("activities")}
          {simpleTable(
            [t("columnTitle"), t("columnScore")],
            activities.map((activity) => [activity.title_ar, scoreByActivity.get(activity.id) ?? "—"]),
            t("activitiesEmpty")
          )}
        </>
      ),
    },
    {
      id: "competencies",
      label: t("methodCompetencies"),
      content: (
        <>
          {editButton("competencies")}
          {simpleTable(
            [t("columnTitle"), t("columnScore")],
            competencies.map((c) => [c.name_ar, scoreByCompetency.get(c.id) ?? "—"]),
            t("competenciesEmpty")
          )}
        </>
      ),
    },
    {
      id: "bau",
      label: t("methodBau"),
      content: (
        <>
          {editButton("bau")}
          {simpleTable(
            [t("columnTitle"), t("columnWeight"), t("columnStatus"), t("columnScore")],
            (bauTasks ?? []).map((task) => [
              task.title_ar,
              task.weight != null ? `${task.weight}%` : "—",
              task.status,
              scoreByBauTask.get(task.id) ?? "—",
            ]),
            t("bauTasksEmpty")
          )}
        </>
      ),
    },
    {
      id: "feedback360",
      label: t("method360"),
      content: (
        <>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("feedbackNote")}</p>
          {simpleTable(
            [t("columnRelation"), t("columnComment")],
            feedback.map((f) => [evalTypeLabels[f.evaluator_relation], f.comments]),
            t("feedbackEmpty")
          )}
        </>
      ),
    },
  ];

  // A method weighted at zero does not take part in this cycle at all, so it
  // is not shown as a tab (2026-08-27 request). The cycle CHECK forces the
  // four weights to total 100, so at least one tab always survives this.
  const visibleMethodTabs = methodTabs.filter((tab) => weights[tab.id as EvaluationMethod] > 0);

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {employee?.full_name_ar ?? "—"}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
        {employee?.employee_number ?? "—"} — {cycle?.name_ar ?? "—"} — {evalTypeLabels[evalType]}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <div className="sru-card" style={{ padding: 16, marginBottom: 24 }}>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          <strong>{t("stateLabel")}</strong> {evaluationStateLabels[state]}
        </p>
        <EvaluationStateAction evaluationId={evaluation.id} currentState={state} />
      </div>

      <section className="sru-card" style={{ marginBottom: 20, padding: "14px 16px" }}>
        <h2 style={{ fontSize: 14, margin: 0 }}>{t("weightedResultHeading")}</h2>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: "4px 0 10px" }}>
          {t("weightedResultNote", {
            distribution: evaluationMethods
              .filter((method) => weights[method] > 0)
              .map((method) => `${methodLabel[method]} ${weights[method]}%`)
              .join("، "),
          })}
        </p>
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, margin: "0 0 10px" }}>
          {weightsSource === "orgUnit" ? t("weightsSourceOrgUnit") : t("weightsSourceCycle")}
        </p>
        {weighted.score == null ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13, margin: 0 }}>{t("weightedResultEmpty")}</p>
        ) : (
          <>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{weighted.score.toFixed(1)}%</p>
            {weighted.missing.length > 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 6 }}>
                {t("weightedResultPartial", {
                  applied: weighted.appliedWeight,
                  methods: weighted.missing.map((method) => methodLabel[method]).join("، "),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>

      <ProfileTabs tabs={visibleMethodTabs} />
    </div>
  );
}
