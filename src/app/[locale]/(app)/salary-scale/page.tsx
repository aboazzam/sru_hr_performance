import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/config";
import { PrintButton } from "@/components/PrintButton";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import { SalaryScaleTable } from "@/components/SalaryScaleTable";

// salary_scale_select's own RLS (check_vpra_global('careerPath','view') OR
// check_vpra_global('employeeData','view')) would let any careerPath=view
// holder (i.e. every employee, via the career-path screen's own grant) read
// the full company-wide salary matrix — but navItems.ts's own gate on this
// tab deliberately requires employeeData specifically, not careerPath,
// exactly because "full company salary figures are more sensitive than a
// promotion-path reference". That distinction was previously enforced only
// by hiding the nav link — this page itself had no matching check (found in
// the same audit that fixed kpis/strategic-goals), so anyone could still
// read the full salary matrix by hitting the URL directly.
export default async function SalaryScalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations("SalaryScalePage");
  const supabase = await createClient();

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const employeeDataLevel =
    ((permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]).find(
      (row) => row.process_area === "employeeData"
    )?.vpra_level ?? "none";
  const canView = hasVpraAccess(employeeDataLevel, "view");

  if (!canView) {
    return (
      <div className="sru-container" style={{ padding: "32px 22px 60px" }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("errorForbidden")}</p>
      </div>
    );
  }

  // RLS-scoped to the caller (salary_scale_select: check_vpra('careerPath',
  // 'view') OR check_vpra('employeeData','view') — SRU_System_Design.md §A's
  // own route table states this exact dual-area rule for /salary-scale).
  // Single FK to job_titles (job_title_id) -> no dual-embed disambiguation
  // needed here, unlike career_path. Verified directly against the REST API
  // before writing this that the embed returns a single object, not an array.
  //
  // step_h/step_i (2026-08-04 fix): the 20260720000001 data migration added
  // these two nullable columns for academic titles' real 9-step scale (A-I,
  // vs admin's 7-step A-G) and populated them for 9 real rows (e.g. "أستاذ"),
  // but this page's query and table never fetched or rendered either column
  // — a real, silent data-completeness gap found while checking this page,
  // not something the migration itself got wrong.
  const { data } = await supabase
    .from("salary_scale")
    .select(
      "id, step_a, step_b, step_c, step_d, step_e, step_f, step_g, step_h, step_i, annual_increase_cap, effective_date, job_titles(name_ar,grade_level)"
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
    step_h: number | null;
    step_i: number | null;
    annual_increase_cap: number | null;
    effective_date: string;
    job_titles: { name_ar: string; grade_level: number } | null;
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
          <h1 className="sru-title" style={{ fontSize: 20 }}>
            {t("title")}
          </h1>
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("subtitle")}
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="sru-diag" style={{ margin: "8px 0 28px" }} />

      {!rows || rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <SalaryScaleTable rows={rows} locale={locale} />
      )}
    </div>
  );
}
