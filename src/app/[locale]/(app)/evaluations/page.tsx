import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/PrintButton";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function EvaluationCyclesPage() {
  const t = await getTranslations("EvaluationCyclesPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (evaluation_cycles_select:
  // check_vpra('evaluation','view')) — every role holding any grant on
  // 'evaluation' (which is most of them) sees the full cycle list, since
  // cycles are university-wide metadata, not per-employee/org-unit scoped.
  const { data } = await supabase
    .from("evaluation_cycles")
    .select("id, name_ar, start_date, end_date")
    .is("deleted_at", null)
    .order("start_date", { ascending: false });

  const cycles = data as Array<{
    id: string;
    name_ar: string;
    start_date: string;
    end_date: string;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/evaluations/mine" className="sru-btn sru-btn-primary">
            {t("myEvaluations")}
          </Link>
          <PrintButton />
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!cycles || cycles.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnStartDate")}</th>
                  <th>{t("columnEndDate")}</th>
                  <th className="no-print">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td>{cycle.name_ar}</td>
                    <td>{cycle.start_date}</td>
                    <td>{cycle.end_date}</td>
                    <td className="no-print">
                      <Link
                        href={`/evaluations/new?cycleId=${cycle.id}`}
                        className="sru-btn sru-btn-primary"
                        style={{ fontSize: 13, padding: "6px 12px" }}
                      >
                        {t("createEvaluation")}
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
