import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { RowLink } from "@/components/RowLink";
import {
  canAdvanceEvaluationState,
  evaluationStateLabels,
  evalTypeLabels,
  type EvaluationState,
  type EvalType,
  type RoleCode,
} from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// The "review queue" the project had no screen for: unlike "My Team's
// Evaluations" (direct reports only, via supervisor_id), this shows every
// evaluation visible to the caller via evaluations_select's broader
// branches (org-unit-scoped 'recommend' for manager/committee, 'approve'
// for hr_admin, is_my_direct_report()) where the caller ALSO currently
// holds an actionable VPRA level at that evaluation's exact state --
// i.e. genuinely "needs my action right now," not just "visible to me."
export default async function EvaluationsReviewPage() {
  const t = await getTranslations("EvaluationsReviewPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle()
    : { data: null };

  // Uses the get_my_role_codes() RPC (20260718000007), not a direct
  // user_roles->roles embed — the embed silently returns nothing for
  // almost every role, same reasoning as transitionEvaluation.
  const { data: roleCodes } = await supabase.rpc("get_my_role_codes");

  // RLS-scoped to the caller (evaluations_select: self-row OR
  // check_vpra('evaluation','recommend', org_unit_id) OR
  // is_my_direct_report() OR check_vpra('evaluation','approve', ...)) --
  // deliberately excludes the caller's own row below (that's "My
  // Evaluations"' job, not this screen's) and is further filtered to
  // rows the caller can actually act on, not merely see.
  const { data } = myProfile
    ? await supabase
        .from("evaluations")
        .select(
          "id, state, eval_type, profiles(full_name_ar, employee_number), evaluation_cycles(name_ar)"
        )
        .neq("employee_id", myProfile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const allVisible = (data ?? []) as unknown as Array<{
    id: string;
    state: EvaluationState;
    eval_type: EvalType;
    profiles: { full_name_ar: string; employee_number: string } | null;
    evaluation_cycles: { name_ar: string } | null;
  }>;

  const roles = (roleCodes ?? []) as RoleCode[];
  const evaluations = allVisible.filter((evaluation) =>
    roles.some((role) => canAdvanceEvaluationState(evaluation.state, role))
  );

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 24 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {evaluations.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnEvalType")}</th>
                  <th>{t("columnState")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <RowLink key={evaluation.id} href={`/evaluations/${evaluation.id}`}>
                    <td>
                      {evaluation.profiles?.employee_number} — {evaluation.profiles?.full_name_ar}
                    </td>
                    <td>{evaluation.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{evalTypeLabels[evaluation.eval_type]}</td>
                    <td>{evaluationStateLabels[evaluation.state]}</td>
                    <td>
                      <Link
                        href={`/evaluations/${evaluation.id}`}
                        className="sru-btn sru-btn-primary"
                        style={{ fontSize: 13, padding: "6px 12px" }}
                      >
                        {t("review")}
                      </Link>
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
