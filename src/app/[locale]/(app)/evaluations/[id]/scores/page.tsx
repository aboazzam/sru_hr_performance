import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EvaluationScoresForm } from "@/components/EvaluationScoresForm";
import { resolveEvaluationCompetencies, describeCompetenciesSource } from "@/lib/evaluationCompetencies";
import { behavioralLevelLabels } from "@/lib/data/competencies";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EvaluationScoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ method?: string }>;
}) {
  const { id } = await params;
  // The cycle screen sends the method it was opened from, so scoring shows one
  // method at a time instead of the whole framework plus every goal at once
  // (2026-08-25). Absent or unrecognised, everything is shown — the direct
  // link to this page keeps behaving as it always did.
  const { method } = await searchParams;
  const showCompetencies = method !== "activities" && method !== "bau";
  const showActivities = method !== "competencies" && method !== "bau";
  const showBau = method === undefined || method === "bau";
  const t = await getTranslations("EvaluationScoresPage");
  const supabase = await createClient();

  // Same RLS-scoped read as the evaluation detail page (evaluations_select)
  // — a missing row and an RLS-blocked row look identical here on purpose.
  const { data: evaluation } = await supabase
    .from("evaluations")
    .select("id, employee_id, cycle_id, profiles(full_name_ar, employee_number)")
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
  };

  const { data: activityData } = await supabase
    .from("initiative_activities")
    .select("id, title_ar")
    .eq("responsible_profile_id", evaluation.employee_id)
    .is("deleted_at", null)
    .order("title_ar");

  const activities = (activityData ?? []) as Array<{ id: string; title_ar: string }>;

  // Routine tasks became scorable in 20260827000002; before it, a cycle could
  // weight them but nothing could hold the score.
  const { data: bauData } = await supabase
    .from("bau_tasks")
    .select("id, title_ar")
    .eq("employee_id", evaluation.employee_id)
    .eq("cycle_id", evaluation.cycle_id)
    .is("deleted_at", null);
  const bauTasks = (bauData ?? []) as Array<{ id: string; title_ar: string }>;

  const { data: existingScores } = await supabase
    .from("evaluation_scores")
    .select("competency_id, activity_id, bau_task_id, score, comment")
    .eq("evaluation_id", evaluation.id)
    .is("deleted_at", null);

  const scoresByCompetency = new Map<string, { score: number | null; comment: string | null }>();
  const scoresByActivity = new Map<string, { score: number | null; comment: string | null }>();
  const scoresByBauTask = new Map<string, { score: number | null; comment: string | null }>();
  for (const row of existingScores ?? []) {
    if (row.competency_id) {
      scoresByCompetency.set(row.competency_id, { score: row.score, comment: row.comment });
    } else if (row.activity_id) {
      scoresByActivity.set(row.activity_id, { score: row.score, comment: row.comment });
    } else if (row.bau_task_id) {
      scoresByBauTask.set(row.bau_task_id, { score: row.score, comment: row.comment });
    }
  }

  const { source, jobTitleNameAr, competencies } = await resolveEvaluationCompetencies(
    supabase,
    evaluation.employee_id,
    [...scoresByCompetency.keys()]
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {employee.employee_number} — {employee.full_name_ar}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <EvaluationScoresForm
        evaluationId={evaluation.id}
        competenciesNote={
          showCompetencies
            ? (() => {
                const note = describeCompetenciesSource(source, jobTitleNameAr);
                return t(note.key, note.params);
              })()
            : undefined
        }
        competencies={(showCompetencies ? competencies : []).map((c) => ({
          id: c.id,
          nameAr: c.nameAr,
          requiredLevelAr: c.requiredLevel ? behavioralLevelLabels[c.requiredLevel] : null,
          initialScore: scoresByCompetency.get(c.id)?.score ?? null,
          initialComment: scoresByCompetency.get(c.id)?.comment ?? null,
        }))}
        activities={(showActivities ? activities : []).map((activity) => ({
          id: activity.id,
          titleAr: activity.title_ar,
          initialScore: scoresByActivity.get(activity.id)?.score ?? null,
          initialComment: scoresByActivity.get(activity.id)?.comment ?? null,
        }))}
        bauTasks={(showBau ? bauTasks : []).map((task) => ({
          id: task.id,
          titleAr: task.title_ar,
          initialScore: scoresByBauTask.get(task.id)?.score ?? null,
          initialComment: scoresByBauTask.get(task.id)?.comment ?? null,
        }))}
        showCompetencies={showCompetencies}
        showActivities={showActivities}
        showBau={showBau}
      />
    </div>
  );
}
