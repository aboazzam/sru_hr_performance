import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { vacancyStatusLabel } from "@/lib/vacancyStatus";
import {
  DEFAULT_VACANCY_SORT,
  filterVacancies,
  isVacancySortOption,
  sortVacancies,
} from "@/lib/vacancyTable";

// Excluded from src/proxy.ts's matcher (which skips /api), so no locale or
// session-refresh runs here — createClient() still works because Route
// Handlers read the request's cookies directly. Same shape as the employees
// and recruitment-requests exports.
//
// Rows are re-fetched through the caller's own RLS-respecting client; nothing
// about WHICH vacancies exist is accepted from the client. The screen's
// search/status/sort ARE accepted as plain strings and re-applied here with
// the very same helpers the table uses, so the file matches what the reader
// was looking at — and those params can only narrow the result, never widen
// it.
//
// No explicit permission gate: unlike طلبات الاحتياج, vacancies are
// deliberately readable by every role holding `vacancies>=view` (internal
// postings are meant to be visible to all staff, 20260719000007), so RLS
// alone is the right and only boundary here — a caller who can see nothing
// simply gets an empty sheet.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("vacancies")
    .select(
      "id, status, requirements_ar, announced_at, posting_scope, created_at, job_titles(name_ar,grade_level), org_units(name_ar)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const vacancies = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    requirements_ar: string | null;
    announced_at: string | null;
    posting_scope: string;
    created_at: string;
    job_titles: { name_ar: string; grade_level: number | null } | null;
    org_units: { name_ar: string } | null;
  }>;

  // "من خطة التوظيف {year}" — the same provenance the list screen shows, read
  // through the caller's own client too: without `recruitmentPlan` visibility
  // this simply comes back empty rather than erroring.
  const { data: planLinks } = await supabase
    .from("recruitment_plan_items")
    .select("vacancy_id, recruitment_plans(plan_year)")
    .not("vacancy_id", "is", null)
    .is("deleted_at", null);

  const planYearByVacancy = new Map<string, number>();
  for (const link of (planLinks ?? []) as unknown as Array<{
    vacancy_id: string;
    recruitment_plans: { plan_year: number } | null;
  }>) {
    if (link.recruitment_plans) planYearByVacancy.set(link.vacancy_id, link.recruitment_plans.plan_year);
  }

  const rows = vacancies.map((v) => ({
    jobTitleName: v.job_titles?.name_ar ?? null,
    gradeLevel: v.job_titles?.grade_level ?? null,
    orgUnitName: v.org_units?.name_ar ?? null,
    status: v.status,
    requirementsAr: v.requirements_ar,
    announced: v.announced_at !== null,
    postingScope: v.posting_scope,
    planYear: planYearByVacancy.get(v.id) ?? null,
    createdAt: v.created_at,
  }));

  const params = request.nextUrl.searchParams;
  const sortParam = params.get("sort") ?? "";
  const visible = sortVacancies(
    filterVacancies(rows, {
      query: params.get("q") ?? "",
      status: params.get("status") ?? "",
    }),
    isVacancySortOption(sortParam) ? sortParam : DEFAULT_VACANCY_SORT
  );

  // Arabic labels come from the same catalogue the table renders from, so the
  // sheet cannot drift from the screen. Exports are Arabic-only here, like
  // every other export in this app.
  const t = await getTranslations({ locale: "ar", namespace: "VacanciesPage" });
  const scopeKeys: Record<string, string> = {
    internal: "scopeInternal",
    external: "scopeExternal",
    both: "scopeBoth",
  };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الشواغر");
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow([
    t("columnJobTitle"),
    t("gradeHeader"),
    t("columnOrgUnit"),
    t("columnStatus"),
    t("announcedHeader"),
    t("scopeSelectLabel"),
    t("planHeader"),
    t("columnRequirements"),
    t("createdAtHeader"),
  ]);
  sheet.getRow(1).font = { bold: true };

  for (const row of visible) {
    sheet.addRow([
      row.jobTitleName ?? "",
      row.gradeLevel ?? "",
      row.orgUnitName ?? "",
      vacancyStatusLabel(row.status),
      row.announced ? t("announcedBadge") : "",
      // The posting scope only means something once a posting is advertised.
      row.announced ? t(scopeKeys[row.postingScope] ?? "scopeInternal") : "",
      row.planYear ?? "",
      row.requirementsAr ?? "",
      row.createdAt.slice(0, 10),
    ]);
  }

  sheet.columns.forEach((col, index) => {
    // The requirements column carries prose; the rest are short values.
    col.width = index === 7 ? 40 : 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vacancies.xlsx"`,
    },
  });
}
