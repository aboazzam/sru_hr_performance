import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { JobTitlesTable } from "@/components/JobTitlesTable";
import { ImportJobTitlesExcelForm } from "@/components/ImportJobTitlesExcelForm";

// Auth is enforced centrally by (app)/layout.tsx.
//
// This is a MANAGEMENT screen (browse all 336 job titles + a link into
// each one's edit page) — restricted to careerPath>=prepare in application
// code, not just RLS. Found live (2026-07-26) that RLS alone (job_titles_select:
// careerPath OR employeeData view) let any view-level role — including a
// plain `employee` — reach this full catalog, when only hr_admin/cxo/ceo
// (the actual prepare+ owners of career-ladder content) should; a
// view-level employee's own job-title/competency info belongs on their
// self-scoped /profile or /career-path view instead. Data is skipped
// entirely (not just hidden) when the check fails, same discipline as
// /admin/org-structure's view-vs-prepare split.
export default async function CareerPathJobTitlesPage() {
  const t = await getTranslations("CareerPathJobTitlesPage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const careerPathLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "careerPath"
    )?.vpra_level ?? "none";
  const canManage = hasVpraAccess(careerPathLevel, "prepare");

  if (!canManage) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <h1 className="sru-title" style={{ fontSize: 24 }}>
          {t("title")}
        </h1>
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 16 }}>{t("noPermission")}</p>
      </div>
    );
  }

  // .is("job_title_competencies.deleted_at", null) filters the embedded
  // resource itself (PostgREST child-row filtering) -- without it, a
  // soft-deleted requirement still inflates this list's competency count.
  const { data: jobTitlesData } = await supabase
    .from("job_titles")
    .select(
      "id, name_ar, name_en, grade_level, description_ar, career_content_status, job_families(name_ar), job_title_competencies(id)"
    )
    .is("deleted_at", null)
    .is("job_title_competencies.deleted_at", null)
    .order("grade_level", { ascending: false })
    .order("name_ar");

  type Row = {
    id: string;
    name_ar: string;
    name_en: string | null;
    grade_level: number;
    description_ar: string | null;
    career_content_status: "draft" | "approved";
    job_families: { name_ar: string } | null;
    job_title_competencies: Array<{ id: string }>;
  };

  const rows = (jobTitlesData as unknown as Row[] | null) ?? [];

  return (
    <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 className="sru-title" style={{ fontSize: 24 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 13, marginTop: 4 }}>{t("subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/career-path/job-titles/new" className="sru-btn sru-btn-primary">
            {t("createNew")}
          </Link>
          <ImportJobTitlesExcelForm />
          <Link href="/career-path" className="sru-btn">
            {t("backToCareerPath")}
          </Link>
        </div>
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 20px" }} />

      <JobTitlesTable rows={rows} />
    </div>
  );
}
