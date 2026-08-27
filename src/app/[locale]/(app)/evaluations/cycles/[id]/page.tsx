import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { formatDateDmy } from "@/lib/dateParts";
import { getLocale } from "next-intl/server";
import {
  canAdvanceEvaluationState,
  evaluationStateLabels,
  evalTypeLabels,
  type EvalType,
  type EvaluationState,
  type RoleCode,
} from "@/lib/vpra";

/**
 * One evaluation cycle, opened from the cycles list.
 *
 * Structure asked for on 2026-08-25: the four evaluation methods as the main
 * headings, and under each the views that used to be buttons on the list
 * screen — "my team" and "needs my review". Choosing a period first and a view
 * second is the order the work actually happens in.
 *
 * The methods are a LENS, not separate records (the project owner's own choice
 * between the two readings): one evaluation still covers the whole cycle, and
 * a method tab narrows what you score inside it. That is why every "team" tab
 * lists the same people — what differs is where the row takes you.
 *
 * Both lists are filtered explicitly, never left to evaluations_select's RLS
 * alone: its approve-level branch would otherwise show hr_admin every
 * evaluation in the system under "my team". Same discipline as the two screens
 * this content comes from.
 */

type MethodKey = "goals" | "competencies" | "bau";

const METHODS: ReadonlyArray<{ key: MethodKey; labelKey: string }> = [
  { key: "goals", labelKey: "methodGoals" },
  { key: "competencies", labelKey: "methodCompetencies" },
  { key: "bau", labelKey: "methodBau" },
];

type EvaluationRow = {
  id: string;
  state: EvaluationState;
  eval_type: EvalType;
  employee_id: string;
  profiles: { full_name_ar: string; employee_number: string } | null;
};

export default async function EvaluationCyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("EvaluationCyclePage");
  const tCycles = await getTranslations("EvaluationCyclesPage");
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: cycle } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, name_en, start_date, end_date, cycle_type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!cycle) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  const { data: roleCodes } = await supabase.rpc("get_my_role_codes");
  const myRoles = (roleCodes ?? []) as RoleCode[];

  // ---- my team's evaluations in THIS cycle -------------------------------
  const { data: reports } = myProfile
    ? await supabase.from("profiles").select("id").eq("supervisor_id", myProfile.id).is("deleted_at", null)
    : { data: null };
  const reportIds = (reports ?? []).map((r) => r.id);

  const { data: teamData } =
    reportIds.length > 0
      ? await supabase
          .from("evaluations")
          .select("id, state, eval_type, employee_id, profiles(full_name_ar, employee_number)")
          .eq("cycle_id", id)
          .in("employee_id", reportIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null };
  const teamEvaluations = (teamData ?? []) as unknown as EvaluationRow[];

  // ---- what I can actually advance in THIS cycle -------------------------
  // Visible to me AND actionable at its exact state by one of my real roles —
  // the same rule /evaluations/review applies, so the two can never disagree.
  const { data: visibleData } = myProfile
    ? await supabase
        .from("evaluations")
        .select("id, state, eval_type, employee_id, profiles(full_name_ar, employee_number)")
        .eq("cycle_id", id)
        .neq("employee_id", myProfile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };
  const reviewEvaluations = ((visibleData ?? []) as unknown as EvaluationRow[]).filter((row) =>
    myRoles.some((role) => canAdvanceEvaluationState(row.state, role))
  );

  // ---- 360 feedback in THIS cycle, split by who gave it ------------------
  const { data: feedbackData } = await supabase
    .from("feedback_360")
    .select("id, evaluator_relation, target_employee_id, comments, submitted_at, profiles!feedback_360_target_employee_id_fkey(full_name_ar, employee_number)")
    .eq("cycle_id", id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: false });
  const feedback = (feedbackData ?? []) as unknown as Array<{
    id: string;
    evaluator_relation: EvalType;
    target_employee_id: string;
    comments: string | null;
    submitted_at: string | null;
    profiles: { full_name_ar: string; employee_number: string } | null;
  }>;

  function evaluationTable(rows: EvaluationRow[], method: MethodKey, emptyMessage: string) {
    if (rows.length === 0) {
      return <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{emptyMessage}</p>;
    }
    return (
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("columnEmployee")}</th>
              <th>{t("columnEmployeeNumber")}</th>
              <th>{t("columnType")}</th>
              <th>{t("columnState")}</th>
              <th>{t("columnAction")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.profiles?.full_name_ar ?? "—"}</td>
                <td>{row.profiles?.employee_number ?? "—"}</td>
                <td>{evalTypeLabels[row.eval_type]}</td>
                <td>{evaluationStateLabels[row.state]}</td>
                <td>
                  {/* The method travels with the link: the scoring screen
                      shows only that method's rows. */}
                  <Link href={`/evaluations/${row.id}/scores?method=${method}`} className="sru-btn sru-btn-slim">
                    {t("scoreButton")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function methodTab(method: MethodKey): ProfileTab {
    const subTabs: ProfileTab[] = [
      {
        id: `${method}-team`,
        label: t("subTabTeam"),
        content: (
          <>
            <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("teamNote")}</p>
            {method === "bau" && (
              <p className="sru-home-clear" style={{ marginBottom: 12 }}>{t("bauNotScorable")}</p>
            )}
            {evaluationTable(teamEvaluations, method, t("teamEmpty"))}
          </>
        ),
      },
      {
        id: `${method}-review`,
        label: t("subTabReview"),
        content: (
          <>
            <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("reviewNote")}</p>
            {evaluationTable(reviewEvaluations, method, t("reviewEmpty"))}
          </>
        ),
      },
    ];
    return {
      id: method,
      label: t(METHODS.find((m) => m.key === method)!.labelKey),
      content: <ProfileTabs tabs={subTabs} />,
    };
  }

  function feedbackTable(relation: EvalType) {
    const rows = feedback.filter((f) => f.evaluator_relation === relation);
    if (rows.length === 0) {
      return <p style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>{t("feedbackEmpty")}</p>;
    }
    return (
      <div className="table-scroll">
        <table className="admin-matrix">
          <thead>
            <tr>
              <th>{t("columnEmployee")}</th>
              <th>{t("columnEmployeeNumber")}</th>
              <th>{t("columnComment")}</th>
              <th>{t("columnSubmittedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.profiles?.full_name_ar ?? "—"}</td>
                <td>{row.profiles?.employee_number ?? "—"}</td>
                <td>{row.comments ?? "—"}</td>
                <td>{row.submitted_at ? formatDateDmy(row.submitted_at.slice(0, 10), locale) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // The 360 relations, in the order asked for. "customer" is deliberately not
  // a sub-tab here: the request named three, and the table's own vocabulary
  // keeps the fourth available wherever 360 feedback is entered.
  const feedbackRelations: ReadonlyArray<{ relation: EvalType; labelKey: string }> = [
    { relation: "self", labelKey: "subTabSelf" },
    { relation: "peer", labelKey: "subTabPeer" },
    { relation: "supervisor", labelKey: "subTabSupervisor" },
  ];

  const tabs: ProfileTab[] = [
    ...METHODS.map((m) => methodTab(m.key)),
    {
      id: "feedback-360",
      label: t("method360"),
      content: (
        <ProfileTabs
          tabs={feedbackRelations.map(({ relation, labelKey }) => ({
            id: `360-${relation}`,
            label: t(labelKey),
            content: (
              <>
                <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 12 }}>{t("feedbackNote")}</p>
                {feedbackTable(relation)}
              </>
            ),
          }))}
        />
      ),
    },
  ];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <Link href="/evaluations" className="sru-btn sru-btn-slim" style={{ marginBottom: 14, display: "inline-flex" }}>
        {t("backToCycles")}
      </Link>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {cycle.name_ar}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
        {tCycles("columnStart")}: {formatDateDmy(cycle.start_date, locale)} — {tCycles("columnEnd")}:{" "}
        {formatDateDmy(cycle.end_date, locale)}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      <ProfileTabs tabs={tabs} />
    </div>
  );
}
