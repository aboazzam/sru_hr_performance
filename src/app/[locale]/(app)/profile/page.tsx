import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { pillars, getCompetenciesByPillar, behavioralLevelLabels, type BehavioralLevel } from "@/lib/data/competencies";
import { evalTypeLabels, evaluationStateLabels, type EvalType, type EvaluationState } from "@/lib/vpra";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import {
  buildForwardCareerTree,
  collectCareerTreeJobTitleIds,
  type CareerPathEdge,
  type CareerTreeNode,
} from "@/lib/careerPathTree";

type ProfileTranslator = Awaited<ReturnType<typeof getTranslations>>;

interface CareerJobTitleInfo {
  nameAr: string;
  gradeLevel: number;
  descriptionAr: string | null;
  competencies: Array<{ nameAr: string; requiredLevel: BehavioralLevel }>;
}

// Renders only the future branches of the tree (the root/current job is
// shown separately above) — indentation communicates depth, and a job with
// more than one next step (real data has genuine fan-outs) simply renders
// more than one card at that level.
function renderCareerTreeNodes(
  nodes: CareerTreeNode[],
  jobTitleInfo: Map<string, CareerJobTitleInfo>,
  t: ProfileTranslator,
  depth: number
) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {nodes.map((node) => {
        const info = jobTitleInfo.get(node.jobTitleId);
        return (
          <li key={node.jobTitleId} style={{ marginInlineStart: depth * 24, marginBottom: 14 }}>
            <div className="sru-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <strong>{info?.nameAr ?? "—"}</strong>
                {info && <span className="sru-chip sru-en">{t("gradeLabel", { grade: info.gradeLevel })}</span>}
              </div>
              {node.requirementsAr && (
                <p style={{ fontSize: 13, marginBottom: 6 }}>
                  <b>{t("careerPathColumnRequirements")}: </b>
                  {node.requirementsAr}
                </p>
              )}
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <b>{t("careerPathJobDescription")}: </b>
                {info?.descriptionAr ?? t("careerPathNoDescription")}
              </p>
              <div style={{ fontSize: 13 }}>
                <b>{t("careerPathRequiredCompetencies")}: </b>
                {info && info.competencies.length > 0 ? (
                  <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {info.competencies.map((c, i) => (
                      <span key={i} className="sru-chip">
                        {c.nameAr} ({behavioralLevelLabels[c.requiredLevel]})
                      </span>
                    ))}
                  </span>
                ) : (
                  t("careerPathNoCompetencies")
                )}
              </div>
            </div>
            {node.children.length > 0 && renderCareerTreeNodes(node.children, jobTitleInfo, t, depth + 1)}
          </li>
        );
      })}
    </ul>
  );
}

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// Read-only for now, per the project owner's explicit "not editable yet"
// decision (2026-07-22) — no avatar column or Storage bucket exists, and no
// other field was named as something an employee should self-edit today.
export default async function MyProfilePage() {
  const t = await getTranslations("MyProfilePage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Self-row is always visible on profiles regardless of VPRA (profiles_select).
  // org_units/job_titles embeds work too: employee holds careerPath=view, and
  // both tables' SELECT policies accept careerPath as one of their OR-branches.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, employee_number, full_name_ar, full_name_en, email, hire_date, status, job_title_id, supervisor_id, org_units(name_ar), job_titles(name_ar, grade_level)"
    )
    .eq("auth_user_id", user!.id)
    .maybeSingle();

  const p = profile as unknown as
    | {
        id: string;
        employee_number: string;
        full_name_ar: string;
        full_name_en: string | null;
        email: string;
        hire_date: string | null;
        status: string;
        job_title_id: string | null;
        supervisor_id: string | null;
        org_units: { name_ar: string } | null;
        job_titles: { name_ar: string; grade_level: number } | null;
      }
    | null;

  // get_my_supervisor() (20260722000002) — profiles_select's RLS has no
  // branch letting a plain employee (no employeeData grant) read an
  // arbitrary colleague's row, including their own supervisor's; confirmed
  // this returns null via a direct query before adding the RPC. Same
  // SECURITY DEFINER self-lookup pattern as get_my_role_codes()/
  // get_my_permissions().
  const { data: supervisorRows } = p?.supervisor_id ? await supabase.rpc("get_my_supervisor") : { data: null };
  const supervisor = (supervisorRows?.[0] as { full_name_ar: string; full_name_en: string | null } | undefined) ?? null;

  // Deliberately filtered to `employee_id = my own profile id`, same
  // discipline as /evaluations/mine — goals_select's RLS would also let
  // broader roles (org-unit scoped goalAssignment=prepare, direct
  // supervisors) see this data, which is wrong for a "my own goals" view.
  const { data: goalsData } = p
    ? await supabase
        .from("goals")
        .select("id, custom_title_ar, weight, target_ar, status, goal_library(title_ar), evaluation_cycles(name_ar)")
        .eq("employee_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const goals = goalsData as unknown as Array<{
    id: string;
    custom_title_ar: string | null;
    weight: number | null;
    target_ar: string | null;
    status: string;
    goal_library: { title_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  // Same self-scoping discipline as goals above — bau_tasks_select's RLS
  // has broader OR-branches (org-unit approve, direct supervisor) that would
  // leak into a "my own tasks" view if not explicitly filtered here too.
  const { data: tasksData } = p
    ? await supabase
        .from("bau_tasks")
        .select("id, title_ar, weight, status, evaluation_cycles(name_ar)")
        .eq("employee_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const tasks = tasksData as unknown as Array<{
    id: string;
    title_ar: string;
    weight: number | null;
    status: string;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  // career_path_select's RLS (check_vpra('careerPath','view')) already lets
  // employee read the whole table -- fetched here in full (small table,
  // ~150-200 rows) and walked forward in TS via buildForwardCareerTree,
  // rather than a new recursive SQL function, matching this app's
  // established preference for assembling small structures client/server
  // side (OrgChartTree, /reports) over new SQL complexity. The tree is then
  // narrowed to exactly the job titles reachable from this employee's own
  // job title -- "his upcoming path only", per the project owner's explicit
  // instruction -- not the full company matrix.
  const { data: allCareerPathEdges } = p?.job_title_id
    ? await supabase.from("career_path").select("id, requirements_ar, from_job_title_id, to_job_title_id").is("deleted_at", null)
    : { data: null };

  const careerPathEdges: CareerPathEdge[] = (allCareerPathEdges ?? []).map((e) => ({
    id: e.id,
    requirementsAr: e.requirements_ar,
    fromJobTitleId: e.from_job_title_id,
    toJobTitleId: e.to_job_title_id,
  }));

  const careerTree = p?.job_title_id ? buildForwardCareerTree(careerPathEdges, p.job_title_id) : null;
  const careerTreeJobTitleIds = careerTree ? [...collectCareerTreeJobTitleIds(careerTree)] : [];

  const { data: careerJobTitlesData } =
    careerTreeJobTitleIds.length > 0
      ? await supabase
          .from("job_titles")
          .select(
            "id, name_ar, grade_level, description_ar, job_title_competencies(required_level, competencies(name_ar))"
          )
          .in("id", careerTreeJobTitleIds)
          .is("deleted_at", null)
      : { data: null };

  const careerJobTitleInfo = new Map<string, CareerJobTitleInfo>(
    (
      careerJobTitlesData as unknown as Array<{
        id: string;
        name_ar: string;
        grade_level: number;
        description_ar: string | null;
        job_title_competencies: Array<{ required_level: BehavioralLevel; competencies: { name_ar: string } | null }>;
      }> | null
    )?.map((jt) => [
      jt.id,
      {
        nameAr: jt.name_ar,
        gradeLevel: jt.grade_level,
        descriptionAr: jt.description_ar,
        competencies: jt.job_title_competencies
          .filter((jtc) => jtc.competencies)
          .map((jtc) => ({ nameAr: jtc.competencies!.name_ar, requiredLevel: jtc.required_level })),
      },
    ]) ?? []
  );

  // "My Performance Level" — an early, explicitly-flagged-as-interim
  // dashboard (2026-07-22): the project owner asked for a performance
  // level view but hadn't specified its exact shape yet, so this combines
  // two tables that already grant a self-row SELECT bypass — evaluations'
  // own scores (evaluation_scores) and any calibration_results — rather
  // than inventing new schema for it.
  const { data: evaluationsData } = p
    ? await supabase
        .from("evaluations")
        .select("id, eval_type, state, evaluation_cycles(name_ar)")
        .eq("employee_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const evaluationsList = evaluationsData as unknown as Array<{
    id: string;
    eval_type: string;
    state: string;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  const evaluationIds = evaluationsList?.map((e) => e.id) ?? [];
  const { data: scoresData } =
    evaluationIds.length > 0
      ? await supabase.from("evaluation_scores").select("evaluation_id, score").in("evaluation_id", evaluationIds).is("deleted_at", null)
      : { data: null };

  const scoresByEvaluation = new Map<string, number[]>();
  for (const row of (scoresData ?? []) as Array<{ evaluation_id: string; score: number | null }>) {
    if (row.score == null) continue;
    const list = scoresByEvaluation.get(row.evaluation_id) ?? [];
    list.push(row.score);
    scoresByEvaluation.set(row.evaluation_id, list);
  }

  const { data: calibrationData } = p
    ? await supabase
        .from("calibration_results")
        .select("id, original_rating, calibrated_rating, justification, calibration_sessions(evaluation_cycles(name_ar))")
        .eq("employee_id", p.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const calibrationResults = calibrationData as unknown as Array<{
    id: string;
    original_rating: number | null;
    calibrated_rating: number | null;
    justification: string | null;
    calibration_sessions: { evaluation_cycles: { name_ar: string } | null } | null;
  }> | null;

  const tabs: ProfileTab[] = !p
    ? []
    : [
        {
          id: "my-data",
          label: t("infoTitle"),
          content: (
            <div className="sru-card" style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("employeeNumberLabel")}</div>
                <div style={{ fontSize: 14 }}>{p.employee_number}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("fullNameArLabel")}</div>
                <div style={{ fontSize: 14 }}>{p.full_name_ar}</div>
              </div>
              {p.full_name_en && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("fullNameEnLabel")}</div>
                  <div style={{ fontSize: 14 }} dir="ltr">{p.full_name_en}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("emailLabel")}</div>
                <div style={{ fontSize: 14 }} dir="ltr">{p.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("orgUnitLabel")}</div>
                <div style={{ fontSize: 14 }}>{p.org_units?.name_ar ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("jobTitleLabel")}</div>
                <div style={{ fontSize: 14 }}>
                  {p.job_titles?.name_ar ?? "—"}
                  {p.job_titles && (
                    <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                      {t("gradeLabel", { grade: p.job_titles.grade_level })}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("hireDateLabel")}</div>
                <div style={{ fontSize: 14 }} dir="ltr">{p.hire_date ?? "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("supervisorLabel")}</div>
                <div style={{ fontSize: 14 }}>{supervisor?.full_name_ar ?? t("supervisorNone")}</div>
              </div>
              {/* [استنتاج] No `qualification`/`certificates` columns exist in `profiles`
                  yet — flagged to the project owner as an open schema decision rather
                  than inventing free-text/multi-value fields without confirming shape. */}
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("qualificationLabel")}</div>
                <div style={{ fontSize: 14, color: "var(--sru-muted)" }}>{t("comingSoon")}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--sru-muted)" }}>{t("certificatesLabel")}</div>
                <div style={{ fontSize: 14, color: "var(--sru-muted)" }}>{t("comingSoon")}</div>
              </div>
            </div>
          ),
        },
        {
          id: "my-kpis",
          label: t("kpisTitle"),
          content: (
            <>
              <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{t("kpisNote")}</p>
              {!goals || goals.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("goalsEmpty")}</p>
              ) : (
                <div className="sru-card">
                  <div className="table-scroll">
                    <table className="admin-matrix">
                      <thead>
                        <tr>
                          <th>{t("goalsColumnTitle")}</th>
                          <th>{t("goalsColumnCycle")}</th>
                          <th>{t("goalsColumnWeight")}</th>
                          <th>{t("goalsColumnStatus")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goals.map((goal) => (
                          <tr key={goal.id}>
                            <td>{goal.goal_library?.title_ar ?? goal.custom_title_ar ?? "—"}</td>
                            <td>{goal.evaluation_cycles?.name_ar ?? "—"}</td>
                            <td>{goal.weight != null ? `${goal.weight}%` : "—"}</td>
                            <td>{goal.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ),
        },
        {
          id: "my-tasks",
          label: t("tasksTitle"),
          content:
            !tasks || tasks.length === 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("tasksEmpty")}</p>
            ) : (
              <div className="sru-card">
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("tasksColumnTitle")}</th>
                        <th>{t("tasksColumnCycle")}</th>
                        <th>{t("tasksColumnWeight")}</th>
                        <th>{t("tasksColumnStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.id}>
                          <td>{task.title_ar}</td>
                          <td>{task.evaluation_cycles?.name_ar ?? "—"}</td>
                          <td>{task.weight != null ? `${task.weight}%` : "—"}</td>
                          <td>{task.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ),
        },
        {
          id: "my-competencies",
          label: t("competenciesTitle"),
          content: (
            <>
              {/* [استنتاج] The real `competencies` table has job_family_id populated on 0
                  of 27 rows today, so there is no actual per-job-family data to cascade --
                  this shows the full institutional framework (same source as /competencies)
                  rather than a personalized subset, flagged to the project owner as a data
                  gap rather than building a filter with nothing to filter by. */}
              <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>
                {t("competenciesNote")}
              </p>
              {pillars.map((pillar) => {
                const items = getCompetenciesByPillar(pillar);
                return (
                  <div key={pillar} style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--sru-blue)", marginBottom: 8 }}>
                      {pillar}
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {items.map((c) => (
                        <span key={c.id} className="sru-chip">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ),
        },
        {
          id: "career-path",
          label: t("careerPathTitle"),
          content: !p.job_title_id ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("careerPathNoJobTitle")}</p>
          ) : !careerTree || careerTree.children.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("careerPathEmpty")}</p>
          ) : (
            <div>
              <div className="sru-card" style={{ marginBottom: 16, padding: 14 }}>
                <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>{t("careerPathCurrentJobLabel")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <strong>{careerJobTitleInfo.get(p.job_title_id)?.nameAr ?? p.job_titles?.name_ar ?? "—"}</strong>
                  {p.job_titles && (
                    <span className="sru-chip sru-en">{t("gradeLabel", { grade: p.job_titles.grade_level })}</span>
                  )}
                </div>
              </div>
              {renderCareerTreeNodes(careerTree.children, careerJobTitleInfo, t, 0)}
            </div>
          ),
        },
        {
          id: "my-performance",
          label: t("performanceTitle"),
          content: (
            <>
              <p style={{ color: "var(--sru-muted)", fontSize: 12.5, marginBottom: 12 }}>{t("performanceNote")}</p>
              {!evaluationsList || evaluationsList.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("performanceEvaluationsEmpty")}</p>
              ) : (
                <div className="sru-card" style={{ marginBottom: 20 }}>
                  <div className="table-scroll">
                    <table className="admin-matrix">
                      <thead>
                        <tr>
                          <th>{t("performanceColumnCycle")}</th>
                          <th>{t("performanceColumnType")}</th>
                          <th>{t("performanceColumnState")}</th>
                          <th>{t("performanceColumnAvgScore")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evaluationsList.map((evaluation) => {
                          const scores = scoresByEvaluation.get(evaluation.id) ?? [];
                          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
                          return (
                            <tr key={evaluation.id}>
                              <td>{evaluation.evaluation_cycles?.name_ar ?? "—"}</td>
                              <td>{evalTypeLabels[evaluation.eval_type as EvalType] ?? evaluation.eval_type}</td>
                              <td>{evaluationStateLabels[evaluation.state as EvaluationState] ?? evaluation.state}</td>
                              <td>{avg != null ? `${avg.toFixed(1)}%` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{t("calibrationTitle")}</h3>
              {!calibrationResults || calibrationResults.length === 0 ? (
                <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("calibrationEmpty")}</p>
              ) : (
                <div className="sru-card">
                  <div className="table-scroll">
                    <table className="admin-matrix">
                      <thead>
                        <tr>
                          <th>{t("calibrationColumnCycle")}</th>
                          <th>{t("calibrationColumnOriginal")}</th>
                          <th>{t("calibrationColumnCalibrated")}</th>
                          <th>{t("calibrationColumnJustification")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibrationResults.map((result) => (
                          <tr key={result.id}>
                            <td>{result.calibration_sessions?.evaluation_cycles?.name_ar ?? "—"}</td>
                            <td>{result.original_rating != null ? `${result.original_rating}%` : "—"}</td>
                            <td>{result.calibrated_rating != null ? `${result.calibrated_rating}%` : "—"}</td>
                            <td>{result.justification ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ),
        },
      ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!p ? <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noProfile")}</p> : <ProfileTabs tabs={tabs} />}
    </div>
  );
}
