import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import {
  hasVpraAccess,
  evaluationStateLabels,
  evalTypeLabels,
  type EvalType,
  type EvaluationState,
  type ProcessArea,
  type VpraLevel,
} from "@/lib/vpra";
import { formatDateDmy } from "@/lib/dateParts";
import {
  evaluationMethods,
  resolveWeights,
  weightedCycleScore,
  type EvaluationMethod,
  type MethodWeights,
} from "@/lib/evaluationCycle";
import { EmployeeCompetenciesPanel } from "@/components/EmployeeCompetenciesPanel";
import { EmployeeBauTasksPanel } from "@/components/EmployeeBauTasksPanel";
import { Employee360NominationsPanel } from "@/components/Employee360NominationsPanel";
import type { BehavioralLevel } from "@/lib/data/competencies";

// Auth is enforced centrally by (app)/layout.tsx. Real row visibility is
// profiles_select's own RLS (self-row OR employeeData>=view OR direct
// report) — a missing row and an RLS-blocked row render identically on
// purpose, same discipline as every other detail page in this app.
//
// Since 2026-08-27 this is a tabbed working screen, not a single facts
// table: most of an employee's evaluation setup (competencies, routine
// tasks, 360 evaluators) happens about ONE person, so it belongs on that
// person's own screen rather than on five separate ones each starting with
// "which employee?".
export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("EmployeeDetailPage");
  const tAct = await getTranslations("EmployeeActivitiesTab");
  const tReport = await getTranslations("EmployeeReportTab");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, employee_number, full_name_ar, full_name_en, email, status, auth_user_id, supervisor_id, org_unit_id, hire_date, qualification, education_speciality, date_of_birth, mobile, marital_status, gender, nationality, employee_category, insurance_category, org_units(name_ar), job_titles(name_ar, grade_level)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("notFound")}</p>
      </div>
    );
  }

  const employee = profile as unknown as {
    id: string;
    employee_number: string;
    full_name_ar: string;
    full_name_en: string | null;
    email: string;
    status: string;
    auth_user_id: string | null;
    supervisor_id: string | null;
    org_unit_id: string | null;
    hire_date: string | null;
    qualification: string | null;
    education_speciality: string | null;
    date_of_birth: string | null;
    mobile: string | null;
    marital_status: string | null;
    gender: string | null;
    nationality: string | null;
    employee_category: string | null;
    insurance_category: string | null;
    org_units: { name_ar: string } | null;
    job_titles: { name_ar: string; grade_level: number } | null;
  };

  const roleLabel = employee.auth_user_id
    ? (await supabase.from("user_roles").select("roles(name_ar)").eq("user_id", employee.auth_user_id)).data
    : (
        await supabase
          .from("pending_role_assignments")
          .select("roles(name_ar)")
          .eq("profile_id", employee.id)
      ).data;

  const roleNames = ((roleLabel ?? []) as unknown as { roles: { name_ar: string } | null }[])
    .map((r) => r.roles?.name_ar)
    .filter((n): n is string => !!n);

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions = (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[];
  const levelOf = (area: ProcessArea): VpraLevel =>
    permissions.find((row) => row.process_area === area)?.vpra_level ?? "none";
  const canEdit = hasVpraAccess(levelOf("employeeData"), "approve");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };
  // Mirrors is_my_direct_report() for the one level that RLS branch covers,
  // so the screen offers exactly what the policy will accept. The policy
  // stays the real gate either way — a write it refuses reports "forbidden".
  const isMyDirectReport = myProfile != null && employee.supervisor_id === myProfile.id;
  const canManageEmployee = canEdit || isMyDirectReport;
  const canManage360 = hasVpraAccess(levelOf("evaluation"), "approve") || isMyDirectReport;
  const canAssignBau = hasVpraAccess(levelOf("bauTasks"), "approve") || employee.id === myProfile?.id;

  // ---- competencies -----------------------------------------------------
  const { data: pillarData } = await supabase.from("competency_pillars").select("id, name_ar");
  const { data: domainData } = await supabase.from("competency_domains").select("id, pillar_id");
  const { data: competencyData } = await supabase
    .from("competencies")
    .select("id, name_ar, type, domain_id")
    .is("deleted_at", null)
    .order("name_ar");
  const pillarNameById = new Map((pillarData ?? []).map((p) => [p.id as string, p.name_ar as string]));
  const pillarByDomain = new Map(
    (domainData ?? []).map((d) => [d.id as string, pillarNameById.get(d.pillar_id as string) ?? "—"])
  );
  const competencyOptions = (competencyData ?? []).map((c) => ({
    id: c.id as string,
    nameAr: c.name_ar as string,
    pillarAr: pillarByDomain.get(c.domain_id as string) ?? "—",
    isCore: (c.type as string) === "core",
  }));

  const { data: employeeCompetencyData } = await supabase
    .from("employee_competencies")
    .select("id, competency_id, required_level")
    .eq("employee_id", employee.id)
    .is("deleted_at", null);
  const assignedCompetencies = (
    (employeeCompetencyData ?? []) as Array<{
      id: string;
      competency_id: string;
      required_level: BehavioralLevel;
    }>
  ).map((row) => ({ id: row.id, competencyId: row.competency_id, requiredLevel: row.required_level }));

  // ---- activities (operational-plan initiatives) ------------------------
  const { data: activityData } = await supabase
    .from("initiative_activities")
    .select("id, title_ar, start_date, end_date, strategic_initiatives(title_ar)")
    .eq("responsible_profile_id", employee.id)
    .is("deleted_at", null)
    .order("start_date", { ascending: true });
  const activities = (activityData ?? []) as unknown as Array<{
    id: string;
    title_ar: string;
    start_date: string | null;
    end_date: string | null;
    strategic_initiatives: { title_ar: string } | null;
  }>;

  // ---- cycles, routine tasks, evaluations -------------------------------
  const { data: cycleData } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, weight_activities, weight_competencies, weight_bau, weight_feedback_360")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });
  const cycles = (cycleData ?? []) as Array<{
    id: string;
    name_ar: string;
    weight_activities: number;
    weight_competencies: number;
    weight_bau: number;
    weight_feedback_360: number;
  }>;
  const cycleNameById = new Map(cycles.map((c) => [c.id, c.name_ar]));

  const { data: bauData } = await supabase
    .from("bau_tasks")
    .select("id, title_ar, cycle_id, weight, status")
    .eq("employee_id", employee.id)
    .is("deleted_at", null);
  const bauRows = (bauData ?? []) as Array<{
    id: string;
    title_ar: string;
    cycle_id: string;
    weight: number | null;
    status: string;
  }>;

  const { data: evaluationData } = await supabase
    .from("evaluations")
    .select("id, cycle_id, state, eval_type")
    .eq("employee_id", employee.id)
    .is("deleted_at", null);
  const evaluations = (evaluationData ?? []) as Array<{
    id: string;
    cycle_id: string;
    state: EvaluationState;
    eval_type: EvalType;
  }>;

  const evaluationIds = evaluations.map((e) => e.id);
  const { data: scoreData } =
    evaluationIds.length > 0
      ? await supabase
          .from("evaluation_scores")
          .select("evaluation_id, competency_id, activity_id, bau_task_id, score")
          .in("evaluation_id", evaluationIds)
          .is("deleted_at", null)
      : { data: [] };
  const scores = (scoreData ?? []) as Array<{
    evaluation_id: string;
    competency_id: string | null;
    activity_id: string | null;
    bau_task_id: string | null;
    score: number | null;
  }>;
  const scoreByBauTask = new Map(
    scores.filter((s) => s.bau_task_id).map((s) => [s.bau_task_id as string, s.score])
  );

  // ---- 360 nominations --------------------------------------------------
  const { data: nominationData } = await supabase
    .from("feedback_360_nominations")
    .select("id, cycle_id, evaluator_id, evaluator_relation")
    .eq("target_employee_id", employee.id)
    .is("deleted_at", null);
  const nominationRows = (nominationData ?? []) as Array<{
    id: string;
    cycle_id: string;
    evaluator_id: string;
    evaluator_relation: EvalType;
  }>;

  const { data: feedbackData } = await supabase
    .from("feedback_360")
    .select("id, cycle_id, evaluator_relation, scores")
    .eq("target_employee_id", employee.id)
    .is("deleted_at", null);
  const feedbackRows = (feedbackData ?? []) as Array<{
    id: string;
    cycle_id: string;
    evaluator_relation: EvalType;
    scores: { overall_score?: unknown } | null;
  }>;
  // evaluator_id on feedback_360 is deliberately unreadable (its column-level
  // grant protects evaluator anonymity), so "has this nominee submitted?" is
  // matched on the pair the two tables genuinely share.
  const submittedPairs = new Set(feedbackRows.map((row) => `${row.cycle_id}|${row.evaluator_relation}`));

  const { data: peopleData } = await supabase
    .from("profiles")
    .select("id, full_name_ar, employee_number")
    .is("deleted_at", null)
    .order("full_name_ar");
  const people = (peopleData ?? []) as Array<{ id: string; full_name_ar: string; employee_number: string }>;
  const personNameById = new Map(people.map((p) => [p.id, p.full_name_ar]));

  // ---- performance report ------------------------------------------------
  const average = (values: Array<number | null | undefined>) => {
    const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return real.length === 0 ? null : real.reduce((sum, v) => sum + v, 0) / real.length;
  };
  // This employee's department may weight its evaluations differently from
  // the cycle default (20260828000001); resolveWeights decides which applies.
  const { data: unitWeightRows } = employee.org_unit_id
    ? await supabase
        .from("org_unit_evaluation_weights")
        .select("cycle_id, weight_activities, weight_competencies, weight_bau, weight_feedback_360")
        .eq("org_unit_id", employee.org_unit_id)
        .is("deleted_at", null)
    : { data: [] };
  const unitWeightsByCycle = new Map<string, MethodWeights>(
    ((unitWeightRows ?? []) as Array<{
      cycle_id: string;
      weight_activities: number;
      weight_competencies: number;
      weight_bau: number;
      weight_feedback_360: number;
    }>).map((row) => [
      row.cycle_id,
      {
        activities: Number(row.weight_activities),
        competencies: Number(row.weight_competencies),
        bau: Number(row.weight_bau),
        feedback360: Number(row.weight_feedback_360),
      },
    ])
  );

  const reportRows = evaluations.map((evaluation) => {
    const cycle = cycles.find((c) => c.id === evaluation.cycle_id);
    const cycleWeights: MethodWeights = {
      activities: Number(cycle?.weight_activities ?? 0),
      competencies: Number(cycle?.weight_competencies ?? 0),
      bau: Number(cycle?.weight_bau ?? 0),
      feedback360: Number(cycle?.weight_feedback_360 ?? 0),
    };
    const { weights, source: weightsSource } = resolveWeights(
      cycleWeights,
      unitWeightsByCycle.get(evaluation.cycle_id) ?? null
    );
    const own = scores.filter((s) => s.evaluation_id === evaluation.id);
    const cycleFeedback = feedbackRows
      .filter((row) => row.cycle_id === evaluation.cycle_id)
      .map((row) => {
        const overall = row.scores && typeof row.scores === "object" ? row.scores.overall_score : null;
        return typeof overall === "number" ? overall : null;
      });
    const weighted = weightedCycleScore(weights, {
      activities: average(own.filter((s) => s.activity_id).map((s) => s.score)),
      competencies: average(own.filter((s) => s.competency_id).map((s) => s.score)),
      bau: average(own.filter((s) => s.bau_task_id).map((s) => s.score)),
      feedback360: average(cycleFeedback),
    });
    return { evaluation, cycle, weights, weighted, weightsSource };
  });

  const methodLabel: Record<EvaluationMethod, string> = {
    activities: tReport("methodActivities"),
    competencies: tReport("methodCompetencies"),
    bau: tReport("methodBau"),
    feedback360: tReport("methodFeedback360"),
  };

  const statusLabelKeys: Record<string, string> = {
    active: "statusActive",
    on_leave: "statusOnLeave",
    terminated: "statusTerminated",
  };

  const fields: Array<[string, string]> = [
    [t("fieldEmployeeNumber"), employee.employee_number],
    [t("fieldNameAr"), employee.full_name_ar],
    [t("fieldNameEn"), employee.full_name_en ?? "—"],
    [t("fieldEmail"), employee.email],
    [t("fieldOrgUnit"), employee.org_units?.name_ar ?? "—"],
    [
      t("fieldJobTitle"),
      employee.job_titles ? `${employee.job_titles.name_ar} (${employee.job_titles.grade_level})` : "—",
    ],
    [t("fieldRole"), roleNames.length > 0 ? roleNames.join("، ") : t("roleNone")],
    [t("fieldStatus"), t(statusLabelKeys[employee.status] ?? "statusActive")],
    [t("fieldAccount"), employee.auth_user_id ? t("accountActive") : t("accountPending")],
    [t("fieldHireDate"), formatDateDmy(employee.hire_date, locale)],
    [t("fieldQualification"), employee.qualification ?? "—"],
    [t("fieldEducationSpeciality"), employee.education_speciality ?? "—"],
    [t("fieldDateOfBirth"), formatDateDmy(employee.date_of_birth, locale)],
    [t("fieldMobile"), employee.mobile ?? "—"],
    [t("fieldMaritalStatus"), employee.marital_status ?? "—"],
    [t("fieldGender"), employee.gender ?? "—"],
    [t("fieldNationality"), employee.nationality ?? "—"],
    [t("fieldEmployeeCategory"), employee.employee_category ?? "—"],
    [t("fieldInsuranceCategory"), employee.insurance_category ?? "—"],
  ];

  const tabs: ProfileTab[] = [
    {
      id: "data",
      label: t("tabData"),
      content: (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <tbody>
                {fields.map(([label, value]) => (
                  <tr key={label}>
                    <th style={{ width: "35%" }}>{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "competencies",
      label: t("tabCompetencies"),
      content: (
        <EmployeeCompetenciesPanel
          employeeId={employee.id}
          options={competencyOptions}
          assigned={assignedCompetencies}
          canEdit={canManageEmployee}
        />
      ),
    },
    {
      id: "activities",
      label: t("tabActivities"),
      content: (
        <div>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 14 }}>{tAct("note")}</p>
          {activities.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{tAct("empty")}</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{tAct("columnActivity")}</th>
                    <th>{tAct("columnInitiative")}</th>
                    <th>{tAct("columnStart")}</th>
                    <th>{tAct("columnEnd")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>{activity.title_ar}</td>
                      <td>{activity.strategic_initiatives?.title_ar ?? "—"}</td>
                      <td>{formatDateDmy(activity.start_date, locale)}</td>
                      <td>{formatDateDmy(activity.end_date, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "bau",
      label: t("tabBauTasks"),
      content: (
        <EmployeeBauTasksPanel
          employeeId={employee.id}
          cycles={cycles.map((c) => ({ id: c.id, name: c.name_ar }))}
          tasks={bauRows.map((task) => ({
            id: task.id,
            titleAr: task.title_ar,
            cycleName: cycleNameById.get(task.cycle_id) ?? "—",
            weight: task.weight,
            status: task.status,
            score: scoreByBauTask.get(task.id) ?? null,
          }))}
          canAssign={canAssignBau}
        />
      ),
    },
    {
      id: "feedback360",
      label: t("tabFeedback360"),
      content: (
        <Employee360NominationsPanel
          targetEmployeeId={employee.id}
          cycles={cycles.map((c) => ({ id: c.id, name: c.name_ar }))}
          employees={people.map((p) => ({ id: p.id, name: `${p.employee_number} — ${p.full_name_ar}` }))}
          nominations={nominationRows.map((row) => ({
            id: row.id,
            cycleId: row.cycle_id,
            cycleName: cycleNameById.get(row.cycle_id) ?? "—",
            evaluatorId: row.evaluator_id,
            evaluatorName: personNameById.get(row.evaluator_id) ?? "—",
            relation: row.evaluator_relation,
            submitted: submittedPairs.has(`${row.cycle_id}|${row.evaluator_relation}`),
          }))}
          canEdit={canManage360}
        />
      ),
    },
    {
      id: "report",
      label: t("tabReport"),
      content: (
        <div>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 14 }}>{tReport("note")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div className="sru-card" style={{ padding: "10px 14px" }}>
              <p style={{ color: "var(--sru-muted)", fontSize: 11, margin: 0 }}>{tReport("statCompetencies")}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{assignedCompetencies.length}</p>
            </div>
            <div className="sru-card" style={{ padding: "10px 14px" }}>
              <p style={{ color: "var(--sru-muted)", fontSize: 11, margin: 0 }}>{tReport("statBauTasks")}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{bauRows.length}</p>
            </div>
            <div className="sru-card" style={{ padding: "10px 14px" }}>
              <p style={{ color: "var(--sru-muted)", fontSize: 11, margin: 0 }}>{tReport("statActivities")}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{activities.length}</p>
            </div>
            <div className="sru-card" style={{ padding: "10px 14px" }}>
              <p style={{ color: "var(--sru-muted)", fontSize: 11, margin: 0 }}>{tReport("statFeedback")}</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {feedbackRows.length}/{nominationRows.length}
              </p>
            </div>
          </div>
          {reportRows.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{tReport("empty")}</p>
          ) : (
            reportRows.map(({ evaluation, cycle, weights, weighted, weightsSource }) => (
              <section key={evaluation.id} className="sru-card" style={{ marginBottom: 16, padding: "14px 16px" }}>
                <h3 style={{ fontSize: 14, margin: 0 }}>
                  {cycle?.name_ar ?? "—"} — {evalTypeLabels[evaluation.eval_type]}
                </h3>
                <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: "4px 0 10px" }}>
                  {tReport("stateLabel")}: {evaluationStateLabels[evaluation.state]}
                </p>
                <p style={{ color: "var(--sru-muted)", fontSize: 12, margin: "0 0 10px" }}>
                  {tReport("distribution", {
                    distribution: evaluationMethods
                      .filter((method) => weights[method] > 0)
                      .map((method) => `${methodLabel[method]} ${weights[method]}%`)
                      .join("، "),
                  })}
                </p>
                <p style={{ color: "var(--sru-muted)", fontSize: 11.5, margin: "0 0 8px" }}>
                  {weightsSource === "orgUnit" ? tReport("weightsSourceOrgUnit") : tReport("weightsSourceCycle")}
                </p>
                {weighted.score == null ? (
                  <p style={{ color: "var(--sru-muted)", fontSize: 13, margin: 0 }}>{tReport("noScores")}</p>
                ) : (
                  <>
                    <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{weighted.score.toFixed(1)}%</p>
                    {weighted.missing.length > 0 ? (
                      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 6 }}>
                        {tReport("partial", {
                          applied: weighted.appliedWeight,
                          methods: weighted.missing.map((method) => methodLabel[method]).join("، "),
                        })}
                      </p>
                    ) : null}
                  </>
                )}
                <p style={{ marginTop: 10, marginBottom: 0 }}>
                  <Link href={`/evaluations/${evaluation.id}`} className="sru-btn sru-btn-slim">
                    {tReport("openEvaluation")}
                  </Link>
                </p>
              </section>
            ))
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {employee.full_name_ar}
          </h1>
          {employee.full_name_en && <p className="sru-name-en is-lg">{employee.full_name_en}</p>}
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{employee.employee_number}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <Link href={`/employees/${employee.id}/edit`} className="sru-btn sru-btn-primary">
              {t("editButton")}
            </Link>
          )}
          <Link href="/employees" className="sru-btn">
            {t("backButton")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
