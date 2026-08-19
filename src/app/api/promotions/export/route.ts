import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { classifyPromotionAgainstCareerPath, promotionStatusLabel } from "@/lib/promotionStatus";
import { filterPromotions } from "@/lib/promotionTable";

// Excluded from src/proxy.ts's matcher (which skips /api), so no locale or
// session-refresh runs here — createClient() still works because Route
// Handlers read the request's cookies directly. Same shape as the employees,
// recruitment-requests and vacancies exports.
//
// Rows are re-fetched through the caller's own RLS-respecting client
// (`promotions_select`: self-row OR check_vpra('promotions','view', the
// employee's org unit)), so a plain employee exports only their own record —
// nothing about WHICH promotions exist is accepted from the client. The
// screen's search and status filter ARE accepted as plain strings and
// re-applied here through the same helper the table uses, so the file matches
// what the reader was looking at; those params can only narrow the result.
//
// No extra permission gate: `promotions_select` already IS the boundary, and
// a caller who can see nothing simply gets an empty sheet — the same reasoning
// as the vacancies export.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // The same explicit relationship hints the page itself needs: two FKs to
  // job_titles plus a direct FK to profiles cannot be auto-disambiguated.
  const { data } = await supabase
    .from("promotions")
    .select(
      "id, status, created_at, from_job_title_id, to_job_title_id, employee:profiles!promotions_employee_id_fkey(employee_number,full_name_ar), evaluation_cycles(name_ar), from_job_title:job_titles!from_job_title_id(name_ar,grade_level), to_job_title:job_titles!to_job_title_id(name_ar,grade_level)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const promotions = (data ?? []) as unknown as Array<{
    id: string;
    status: string;
    created_at: string;
    from_job_title_id: string | null;
    to_job_title_id: string;
    employee: { employee_number: string; full_name_ar: string } | null;
    evaluation_cycles: { name_ar: string } | null;
    from_job_title: { name_ar: string; grade_level: number } | null;
    to_job_title: { name_ar: string; grade_level: number } | null;
  }>;

  // The real career ladder, read through the caller's own client: without
  // `careerPath>=view` this comes back empty and the column says nothing
  // rather than guessing — exactly what the screen does.
  const { data: careerEdges } = await supabase
    .from("career_path")
    .select("from_job_title_id, to_job_title_id")
    .is("deleted_at", null);
  const edges = (careerEdges ?? []).map((e) => ({
    fromJobTitleId: e.from_job_title_id,
    toJobTitleId: e.to_job_title_id,
  }));

  const rows = promotions.map((p) => ({
    employeeNumber: p.employee?.employee_number ?? null,
    employeeName: p.employee?.full_name_ar ?? null,
    cycleName: p.evaluation_cycles?.name_ar ?? null,
    fromTitleName: p.from_job_title?.name_ar ?? null,
    fromGrade: p.from_job_title?.grade_level ?? null,
    toTitleName: p.to_job_title?.name_ar ?? null,
    toGrade: p.to_job_title?.grade_level ?? null,
    status: p.status,
    createdAt: p.created_at,
    careerPathMatch:
      edges.length === 0
        ? ("unknown" as const)
        : classifyPromotionAgainstCareerPath(p.from_job_title_id, p.to_job_title_id, edges),
  }));

  const params = request.nextUrl.searchParams;
  const visible = filterPromotions(rows, {
    query: params.get("q") ?? "",
    status: params.get("status") ?? "",
  });

  // Arabic labels from the same catalogue the table renders from, so the
  // sheet cannot drift from the screen.
  const t = await getTranslations({ locale: "ar", namespace: "PromotionsPage" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الترقيات");
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow([
    t("employeeNumberHeader"),
    t("employeeNameHeader"),
    t("columnCycle"),
    t("columnFrom"),
    t("fromGradeHeader"),
    t("columnTo"),
    t("toGradeHeader"),
    t("columnStatus"),
    t("careerPathHeader"),
    t("createdAtHeader"),
  ]);
  sheet.getRow(1).font = { bold: true };

  for (const row of visible) {
    sheet.addRow([
      row.employeeNumber ?? "",
      row.employeeName ?? "",
      row.cycleName ?? "",
      row.fromTitleName ?? "",
      row.fromGrade ?? "",
      row.toTitleName ?? "",
      row.toGrade ?? "",
      promotionStatusLabel(row.status),
      // "unknown" means the ladder itself is not visible to this caller, so
      // the cell stays empty rather than implying an off-ladder move.
      row.careerPathMatch === "unknown"
        ? ""
        : row.careerPathMatch === "on_path"
          ? t("onCareerPath")
          : t("offCareerPath"),
      row.createdAt.slice(0, 10),
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="promotions.xlsx"`,
    },
  });
}
