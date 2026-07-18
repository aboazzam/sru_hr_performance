import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function GoalLibraryPage() {
  const t = await getTranslations("GoalLibraryPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (goal_library_select: check_vpra('goalsLibrary',
  // 'view')). job_family_id is a single, nullable FK -> job_families, so the
  // embed returns a single object or null, not an array — verified directly
  // against the REST API before writing this (same habit as career_path/
  // salary_scale, to avoid repeating the org_units embed bug from the
  // employees list page).
  const { data } = await supabase
    .from("goal_library")
    .select("id, title_ar, title_en, description_ar, default_weight, job_families(name_ar)")
    .is("deleted_at", null)
    .order("title_ar");

  const goals = data as unknown as Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    description_ar: string | null;
    default_weight: number | null;
    job_families: { name_ar: string } | null;
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
        <PrintButton />
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!goals || goals.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnTitle")}</th>
                  <th>{t("columnJobFamily")}</th>
                  <th>{t("columnDefaultWeight")}</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal) => (
                  <tr key={goal.id}>
                    <td>
                      {goal.title_ar}
                      {goal.description_ar && (
                        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>
                          {goal.description_ar}
                        </p>
                      )}
                    </td>
                    <td>{goal.job_families?.name_ar ?? t("allJobFamilies")}</td>
                    <td>{goal.default_weight != null ? `${goal.default_weight}%` : "—"}</td>
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
