import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/config";
import { PrintButton } from "@/components/PrintButton";

export default async function SalaryScalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("SalaryScalePage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  // RLS-scoped to the caller (salary_scale_select: check_vpra('careerPath',
  // 'view') OR check_vpra('employeeData','view') — SRU_System_Design.md §A's
  // own route table states this exact dual-area rule for /salary-scale).
  // Single FK to job_titles (job_title_id) -> no dual-embed disambiguation
  // needed here, unlike career_path. Verified directly against the REST API
  // before writing this that the embed returns a single object, not an array.
  const { data } = await supabase
    .from("salary_scale")
    .select(
      "id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, annual_increase_cap, effective_date, job_titles(name_ar,grade_level)"
    )
    .is("deleted_at", null)
    .order("effective_date", { ascending: false });

  const rows = data as unknown as Array<{
    id: string;
    step_a: number;
    step_b: number;
    step_c: number;
    step_d: number;
    step_e: number;
    step_f: number;
    step_g: number;
    annual_increase_cap: number | null;
    effective_date: string;
    job_titles: { name_ar: string; grade_level: number } | null;
  }> | null;

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

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

      {!rows || rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                  <th>{t("columnAnnualCap")}</th>
                  <th>{t("columnEffectiveDate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.job_titles?.name_ar ?? "—"}
                      {row.job_titles && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: row.job_titles.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{formatNumber(row.step_a)}</td>
                    <td>{formatNumber(row.step_b)}</td>
                    <td>{formatNumber(row.step_c)}</td>
                    <td>{formatNumber(row.step_d)}</td>
                    <td>{formatNumber(row.step_e)}</td>
                    <td>{formatNumber(row.step_f)}</td>
                    <td>{formatNumber(row.step_g)}</td>
                    <td>{row.annual_increase_cap != null ? formatNumber(row.annual_increase_cap) : "—"}</td>
                    <td>{row.effective_date}</td>
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
