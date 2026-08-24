import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { evaluationStateLabels, evalTypeLabels, type EvaluationState, type EvalType } from "@/lib/vpra";
import { RowLink } from "@/components/RowLink";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function MyEvaluationsPage() {
  const t = await getTranslations("MyEvaluationsPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Self-row is always visible on profiles regardless of VPRA
  // (profiles_select) — this is how we resolve "my own" profile id.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user!.id)
    .maybeSingle();

  // Deliberately filtered to `employee_id = my own profile id`, not left to
  // evaluations_select's RLS alone — that policy's non-self branch
  // (check_vpra('evaluation','approve',...)) would let hr_admin see EVERY
  // evaluation in the system here, which is wrong for a "my own
  // evaluations" self-service view. The explicit .eq() below ensures this
  // page only ever shows rows where the caller themselves is the employee,
  // regardless of what broader access their role separately grants.
  const { data } = profile
    ? await supabase
        .from("evaluations")
        .select("id, state, eval_type, evaluation_cycles(name_ar)")
        .eq("employee_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const evaluations = data as unknown as Array<{
    id: string;
    state: EvaluationState;
    eval_type: EvalType;
    evaluation_cycles: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <h1 className="sru-title" style={{ fontSize: 20 }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4, marginBottom: 20 }}>
        {t("subtitle")}
      </p>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!evaluations || evaluations.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnEvalType")}</th>
                  <th>{t("columnState")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <RowLink key={evaluation.id} href={`/evaluations/${evaluation.id}`}>
                    <td>{evaluation.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{evalTypeLabels[evaluation.eval_type]}</td>
                    <td>{evaluationStateLabels[evaluation.state]}</td>
                    <td>
                      <Link
                        href={`/evaluations/${evaluation.id}`}
                        className="sru-btn sru-btn-primary"
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        {t("view")}
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
