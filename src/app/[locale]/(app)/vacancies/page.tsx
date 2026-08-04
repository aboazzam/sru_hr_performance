import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { ImportVacanciesExcelForm } from "@/components/ImportVacanciesExcelForm";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
export default async function VacanciesPage() {
  const t = await getTranslations("VacanciesPage");
  const supabase = await createClient();

  // RLS-scoped to the caller (vacancies_select: check_vpra('vacancies',
  // 'view', org_unit_id)) — unlike promotions/rewards/calibration,
  // `employee` holds a real 'view' grant on `vacancies` in the seeded
  // matrix (internal job postings are meant to be visible to all staff),
  // so this list is not restricted to oversight roles. job_titles/
  // org_units are each a single, unambiguous FK here (unlike promotions/
  // rewards' dual FKs to profiles) — verified this exact shape against
  // the REST API with a real temporary row before writing this query.
  const { data } = await supabase
    .from("vacancies")
    .select("id, status, requirements_ar, job_titles(name_ar,grade_level), org_units(name_ar)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const vacancies = data as unknown as Array<{
    id: string;
    status: string;
    requirements_ar: string | null;
    job_titles: { name_ar: string; grade_level: number } | null;
    org_units: { name_ar: string } | null;
  }> | null;

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div
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
        {/* Import buttons live in the always-visible header, NOT behind the
            empty-list check — bootstrapping data when no vacancy exists yet is
            the main reason to use them (same placement decision as the
            career-path page's own import). */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ImportVacanciesExcelForm />
          <Link href="/vacancies/new" className="sru-btn sru-btn-primary">
            {t("newVacancy")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!vacancies || vacancies.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnRequirements")}</th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      {vacancy.job_titles?.name_ar ?? "—"}
                      {vacancy.job_titles && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: vacancy.job_titles.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{vacancy.org_units?.name_ar ?? "—"}</td>
                    <td>{vacancy.status}</td>
                    <td>{vacancy.requirements_ar ?? "—"}</td>
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
