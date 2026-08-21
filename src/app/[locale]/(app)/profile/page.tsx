import { getLocale, getTranslations } from "next-intl/server";
import { formatDateDmy } from "@/lib/dateParts";
import { createClient } from "@/lib/supabase/server";
import { pillars, getCompetenciesByPillar } from "@/lib/data/competencies";
import { evalTypeLabels, evaluationStateLabels, type EvalType, type EvaluationState } from "@/lib/vpra";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { type CareerJobTitleInfo } from "@/lib/careerPathTree";
import { getSelfScopedCareerTree } from "@/lib/careerPathData";
import { CareerPathForwardTree } from "@/components/CareerPathForwardTree";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// Read-only for now, per the project owner's explicit "not editable yet"
// decision (2026-07-22) — no avatar column or Storage bucket exists, and no
// other field was named as something an employee should self-edit today.
export default async function MyProfilePage() {
  const t = await getTranslations("MyProfilePage");
  const locale = await getLocale();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `user` can be null here even though (app)/layout.tsx's own getUser() call
  // already gated this route -- the exact same class of crash already found
  // and fixed on /reports for a background/prefetch request that reached the
  // page before the layout's redirect took effect. Treat it the same as "no
  // linked profile" (the existing `!p` branch below) rather than crash on
  // `user!.id`.
  //
  // Self-row is always visible on profiles regardless of VPRA (profiles_select).
  // org_units/job_titles embeds work too: employee holds careerPath=view, and
  // both tables' SELECT policies accept careerPath as one of their OR-branches.
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select(
          "id, employee_number, full_name_ar, full_name_en, email, hire_date, status, job_title_id, supervisor_id, qualification, education_speciality, mobile, org_units(name_ar), job_titles(name_ar, grade_level)"
        )
        .eq("auth_user_id", user.id)
        .maybeSingle()
    : { data: null };

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
        qualification: string | null;
        education_speciality: string | null;
        mobile: string | null;
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
  // employee read the whole table -- getSelfScopedCareerTree fetches it in
  // full (small table, ~150-200 rows) and walks it forward in TS via
  // buildForwardCareerTree, rather than a new recursive SQL function,
  // matching this app's established preference for assembling small
  // structures client/server side (OrgChartTree, /reports) over new SQL
  // complexity. Narrowed to exactly the job titles reachable from this
  // employee's own job title -- "his upcoming path only", per the project
  // owner's explicit instruction -- not the full company matrix. Shared
  // with /career-path's own view-only branch (2026-07-26) so both render
  // identically instead of duplicating this fetch+walk logic.
  const { tree: careerTree, jobTitleInfo: careerJobTitleInfo } = p?.job_title_id
    ? await getSelfScopedCareerTree(supabase, p.job_title_id)
    : { tree: null, jobTitleInfo: new Map<string, CareerJobTitleInfo>() };

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
            <div className="sru-profile-info">
              {/* A person, then their facts: the identity band carries the
                  name and the three things that place them, and the rest is
                  grouped so the eye is not asked to scan ten equal boxes. */}
              <div className="sru-profile-identity">
                <span className="sru-profile-avatar" aria-hidden>
                  {p.full_name_ar.trim().charAt(0)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="sru-profile-name">{p.full_name_ar}</h2>
                  {p.full_name_en && (
                    <p dir="ltr" className="sru-profile-name-en">
                      {p.full_name_en}
                    </p>
                  )}
                  <div className="sru-profile-badges">
                    <span className="sru-chip sru-en">{p.employee_number}</span>
                    {p.job_titles?.name_ar && (
                      <span className="sru-chip">
                        {p.job_titles.name_ar}
                        <span className="sru-en" style={{ marginInlineStart: 6, opacity: 0.75 }}>
                          {t("gradeLabel", { grade: p.job_titles.grade_level })}
                        </span>
                      </span>
                    )}
                    {p.org_units?.name_ar && <span className="sru-chip">{p.org_units.name_ar}</span>}
                  </div>
                </div>
              </div>

              <div className="sru-profile-groups">
                <section className="sru-profile-group">
                  <h3>{t("contactGroup")}</h3>
                  <dl>
                    <dt>{t("emailLabel")}</dt>
                    <dd dir="ltr">{p.email}</dd>
                    <dt>{t("mobileLabel")}</dt>
                    <dd dir="ltr">{p.mobile ?? "—"}</dd>
                  </dl>
                </section>

                <section className="sru-profile-group">
                  <h3>{t("jobGroup")}</h3>
                  <dl>
                    <dt>{t("orgUnitLabel")}</dt>
                    <dd>{p.org_units?.name_ar ?? "—"}</dd>
                    <dt>{t("jobTitleLabel")}</dt>
                    <dd>{p.job_titles?.name_ar ?? "—"}</dd>
                    <dt>{t("hireDateLabel")}</dt>
                    <dd>{p.hire_date ? formatDateDmy(p.hire_date, locale) : "—"}</dd>
                    <dt>{t("supervisorLabel")}</dt>
                    <dd>{supervisor?.full_name_ar ?? t("supervisorNone")}</dd>
                  </dl>
                </section>

                <section className="sru-profile-group">
                  <h3>{t("qualificationsGroup")}</h3>
                  <dl>
                    <dt>{t("qualificationLabel")}</dt>
                    <dd>{p.qualification ?? "—"}</dd>
                    <dt>{t("specialityLabel")}</dt>
                    <dd>{p.education_speciality ?? "—"}</dd>
                    {/* No `certificates` column exists in `profiles` — still an
                        open schema decision, so it says so instead of showing a
                        dash that would read as "none recorded". */}
                    <dt>{t("certificatesLabel")}</dt>
                    <dd className="is-pending">{t("comingSoon")}</dd>
                  </dl>
                </section>
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
          content: !p.job_title_id || !careerTree ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("careerPathNoJobTitle")}</p>
          ) : (
            <div>
              <CareerPathForwardTree
                currentJobTitleId={p.job_title_id}
                tree={careerTree}
                jobTitleInfo={careerJobTitleInfo}
                labels={{
                  currentJobLabel: t("careerPathCurrentJobLabel"),
                  gradeLabel: (grade) => t("gradeLabel", { grade }),
                  requirementsLabel: t("careerPathColumnRequirements"),
                  descriptionLabel: t("careerPathJobDescription"),
                  noDescriptionLabel: t("careerPathNoDescription"),
                  competenciesLabel: t("careerPathRequiredCompetencies"),
                  noCompetenciesLabel: t("careerPathNoCompetencies"),
                  pendingApprovalLabel: t("careerPathPendingApproval"),
                }}
              />
              {careerTree.children.length === 0 && (
                <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 16 }}>{t("careerPathEmpty")}</p>
              )}
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
