import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
// RLS-scoped via job_titles_select (careerPath OR employeeData view) —
// same broad read access as job_titles everywhere else in this app; the
// edit link on each row leads to a page that itself re-checks careerPath
// prepare+ before allowing any write, so a view-only visitor here can
// browse but not edit.
export default async function CareerPathJobTitlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getTranslations("CareerPathJobTitlesPage");
  const supabase = await createClient();

  const { data: jobTitlesData } = await supabase
    .from("job_titles")
    .select("id, name_ar, grade_level, description_ar, job_families(name_ar), job_title_competencies(id)")
    .is("deleted_at", null)
    .order("grade_level", { ascending: false })
    .order("name_ar");

  type Row = {
    id: string;
    name_ar: string;
    grade_level: number;
    description_ar: string | null;
    job_families: { name_ar: string } | null;
    job_title_competencies: Array<{ id: string }>;
  };

  let rows = (jobTitlesData as unknown as Row[] | null) ?? [];
  const query = q?.trim();
  if (query) {
    rows = rows.filter((r) => r.name_ar.includes(query) || r.job_families?.name_ar.includes(query));
  }

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <Link href="/career-path" className="sru-btn">
          {t("backToCareerPath")}
        </Link>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <form method="get" style={{ marginBottom: 20 }}>
        <input
          type="text"
          name="q"
          defaultValue={query ?? ""}
          placeholder={t("searchPlaceholder")}
          style={{
            width: "100%",
            maxWidth: 360,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--sru-border)",
            background: "var(--background)",
          }}
        />
      </form>

      {rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnFamily")}</th>
                  <th>{t("columnDescription")}</th>
                  <th>{t("columnCompetencies")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name_ar}
                      <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                        {t("gradeLabel", { grade: r.grade_level })}
                      </span>
                    </td>
                    <td>{r.job_families?.name_ar ?? "—"}</td>
                    <td>{r.description_ar ? t("hasDescription") : t("noDescription")}</td>
                    <td>{t("competencyCount", { count: r.job_title_competencies.length })}</td>
                    <td>
                      <Link href={`/career-path/job-titles/${r.id}`} className="sru-btn">
                        {t("manage")}
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
