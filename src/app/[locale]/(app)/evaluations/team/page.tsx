import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { evaluationStateLabels, type EvaluationState } from "@/lib/vpra";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function MyTeamEvaluationsPage() {
  const t = await getTranslations("MyTeamEvaluationsPage");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user!.id)
    .maybeSingle();

  // Direct reports only (profiles.supervisor_id — 20260718000008), scoped
  // by profiles_select's own RLS (employeeData view, or self).
  const { data: reports } = myProfile
    ? await supabase
        .from("profiles")
        .select("id")
        .eq("supervisor_id", myProfile.id)
        .is("deleted_at", null)
    : { data: null };

  const reportIds = (reports ?? []).map((r) => r.id);

  // Deliberately filtered to `employee_id IN (my own direct reports)`, not
  // left to evaluations_select's RLS alone — that policy's
  // check_vpra('evaluation','approve',...) branch would let hr_admin (or
  // any approve-level role) see EVERY evaluation in the system here, same
  // reasoning as "My Evaluations" (20260718000023's self-filter). This
  // page must only ever show evaluations for the caller's OWN real direct
  // reports, regardless of what broader access their role separately
  // grants.
  const { data } =
    reportIds.length > 0
      ? await supabase
          .from("evaluations")
          .select("id, state, profiles(full_name_ar, employee_number), evaluation_cycles(name_ar)")
          .in("employee_id", reportIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: null };

  const evaluations = data as unknown as Array<{
    id: string;
    state: EvaluationState;
    profiles: { full_name_ar: string; employee_number: string } | null;
    evaluation_cycles: { name_ar: string } | null;
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

      {!evaluations || evaluations.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnState")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.id}>
                    <td>
                      {evaluation.profiles?.employee_number} — {evaluation.profiles?.full_name_ar}
                    </td>
                    <td>{evaluation.evaluation_cycles?.name_ar ?? "—"}</td>
                    <td>{evaluationStateLabels[evaluation.state]}</td>
                    <td>
                      <Link
                        href={`/evaluations/${evaluation.id}`}
                        className="sru-btn sru-btn-primary"
                        style={{ fontSize: 13, padding: "6px 12px" }}
                      >
                        {t("view")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
