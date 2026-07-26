import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/PrintButton";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { getSelfScopedCareerTree } from "@/lib/careerPathData";
import { CareerPathForwardTree } from "@/components/CareerPathForwardTree";

// Auth is enforced centrally by (app)/layout.tsx — no per-page check needed.
//
// Level-aware, same pattern as /admin/org-structure (view vs prepare+):
// found live (2026-07-26) that a plain `employee` holding only
// `careerPath=view` (e.g. "أخصائي مصادر تعلم") saw the FULL company-wide
// career_path matrix here — unrelated rows like customer-service career
// steps — when the actual intent (already documented on the nav item
// itself: "a reasonable thing for anyone to browse for their own
// progression") was that a view-only caller should only ever see THEIR
// OWN forward path, exactly like /profile's career-path tab. `prepare`+
// (hr_admin/cxo/ceo per the real seeded matrix) still gets the full
// browsable matrix plus the management-screen link, since they're the
// actual owners of the career ladder's definition, not individual
// employees.
export default async function CareerPathPage() {
  const t = await getTranslations("CareerPathPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const careerPathLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "careerPath"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(careerPathLevel, "prepare");

  if (!canManage) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from("profiles").select("job_title_id").eq("auth_user_id", user.id).maybeSingle()
      : { data: null };

    const { tree, jobTitleInfo } = profile?.job_title_id
      ? await getSelfScopedCareerTree(supabase, profile.job_title_id)
      : { tree: null, jobTitleInfo: null };

    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("selfSubtitle")}</p>
        <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

        {!profile?.job_title_id || !tree || !jobTitleInfo ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("selfNoJobTitle")}</p>
        ) : (
          <div>
            <CareerPathForwardTree
              currentJobTitleId={profile.job_title_id}
              tree={tree}
              jobTitleInfo={jobTitleInfo}
              labels={{
                currentJobLabel: t("selfCurrentJobLabel"),
                gradeLabel: (grade) => t("gradeLabel", { grade }),
                requirementsLabel: t("columnRequirements"),
                descriptionLabel: t("selfDescriptionLabel"),
                noDescriptionLabel: t("selfNoDescription"),
                competenciesLabel: t("selfCompetenciesLabel"),
                noCompetenciesLabel: t("selfNoCompetencies"),
              }}
            />
            {tree.children.length === 0 && (
              <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 16 }}>{t("selfEmpty")}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // RLS-scoped to the caller (career_path_select: check_vpra_global('careerPath','view')).
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
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/career-path/job-titles" className="sru-btn">
            {t("manageJobTitles")}
          </Link>
          <PrintButton />
        </div>
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
