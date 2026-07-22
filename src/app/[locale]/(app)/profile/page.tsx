import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { pillars, getCompetenciesByPillar } from "@/lib/data/competencies";

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
      "id, employee_number, full_name_ar, full_name_en, email, hire_date, status, job_title_id, org_units(name_ar), job_titles(name_ar, grade_level)"
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
        org_units: { name_ar: string } | null;
        job_titles: { name_ar: string; grade_level: number } | null;
      }
    | null;

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
  // employee read the whole table; filtered here to rows touching their own
  // job title specifically, per the project owner's explicit request ("his
  // career path", not the full company matrix) — same self-scoping
  // discipline as goals/evaluations above, not left to a broader RLS grant.
  const { data: careerPathData } = p?.job_title_id
    ? await supabase
        .from("career_path")
        .select(
          "id, requirements_ar, from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
        )
        .or(`from_job_title_id.eq.${p.job_title_id},to_job_title_id.eq.${p.job_title_id}`)
        .is("deleted_at", null)
    : { data: null };

  const careerPaths = careerPathData as unknown as Array<{
    id: string;
    requirements_ar: string | null;
    from_job_title: { name_ar: string; grade_level: number } | null;
    to_job_title: { name_ar: string; grade_level: number } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!p ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noProfile")}</p>
      ) : (
        <>
          <section style={{ marginBottom: 36 }}>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
              {t("infoTitle")}
            </h2>
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
            </div>
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
              {t("goalsTitle")}
            </h2>
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
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
              {t("tasksTitle")}
            </h2>
            {!tasks || tasks.length === 0 ? (
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
            )}
          </section>

          <section style={{ marginBottom: 36 }}>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
              {t("competenciesTitle")}
            </h2>
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
          </section>

          <section>
            <h2 className="sru-title" style={{ fontSize: 18, marginBottom: 14 }}>
              {t("careerPathTitle")}
            </h2>
            {!p.job_title_id ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("careerPathNoJobTitle")}</p>
            ) : !careerPaths || careerPaths.length === 0 ? (
              <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("careerPathEmpty")}</p>
            ) : (
              <div className="sru-card">
                <div className="table-scroll">
                  <table className="admin-matrix">
                    <thead>
                      <tr>
                        <th>{t("careerPathColumnFrom")}</th>
                        <th>{t("careerPathColumnTo")}</th>
                        <th>{t("careerPathColumnRequirements")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {careerPaths.map((path) => (
                        <tr key={path.id}>
                          <td>
                            {path.from_job_title?.name_ar ?? "—"}
                            {path.from_job_title && (
                              <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                                {t("gradeLabel", { grade: path.from_job_title.grade_level })}
                              </span>
                            )}
                          </td>
                          <td>
                            {path.to_job_title?.name_ar ?? "—"}
                            {path.to_job_title && (
                              <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                                {t("gradeLabel", { grade: path.to_job_title.grade_level })}
                              </span>
                            )}
                          </td>
                          <td>{path.requirements_ar ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
