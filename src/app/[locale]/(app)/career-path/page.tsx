import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/config";
import { PrintButton } from "@/components/PrintButton";

export default async function CareerPathPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("CareerPathPage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  // RLS-scoped to the caller (career_path_select: check_vpra('careerPath','view')).
  // Two FKs to job_titles from the same table require explicit relationship
  // hints (`job_titles!from_job_title_id`) — PostgREST can't auto-disambiguate
  // otherwise. Verified directly against the REST API (not just tsc) that
  // both embeds return single objects, matching the type below — see the
  // org_units embed bug in the employees list page for why that check matters.
  const { data } = await supabase
    .from("career_path")
    .select(
      "id, requirements_ar, requirements_en, from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
    )
    .is("deleted_at", null);

  const careerPaths = data as unknown as Array<{
    id: string;
    requirements_ar: string | null;
    requirements_en: string | null;
    from_job_title: { name_ar: string; grade_level: number } | null;
    to_job_title: { name_ar: string; grade_level: number } | null;
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

      {!careerPaths || careerPaths.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnFrom")}</th>
                  <th>{t("columnTo")}</th>
                  <th>{t("columnRequirements")}</th>
                </tr>
              </thead>
              <tbody>
                {careerPaths.map((path) => (
                  <tr key={path.id}>
                    <td>
                      {path.from_job_title?.name_ar ?? "—"}
                      {path.from_job_title && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: path.from_job_title.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>
                      {path.to_job_title?.name_ar ?? "—"}
                      {path.to_job_title && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: path.to_job_title.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{path.requirements_ar ?? "—"}</td>
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
