import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasVpraAccess, type ProcessArea, type VpraLevel } from "@/lib/vpra";
import {
  requestStatusLabel,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  DEFAULT_REQUEST_SORT,
  filterRequests,
  isRequestSortOption,
  sortRequests,
} from "@/lib/recruitmentRequestTable";

// Excluded from src/proxy.ts's matcher (which skips /api entirely), so no
// locale/session-refresh happens here automatically — createClient() still
// works because Route Handlers read the request's cookies directly, same as
// Server Components/Actions. Mirrors src/app/api/employees/export/route.ts.
//
// The rows are re-fetched here through the caller's own RLS-respecting
// client; nothing about WHICH requests exist is accepted from the client.
// The screen's search/status/sort ARE accepted — as plain strings, re-applied
// server-side through the same pure helpers the table uses — so the file
// matches what the person was looking at when they pressed the button. Those
// params can only narrow the result, never widen it.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: permissionRows } = await supabase.rpc("get_my_permissions");
  const permissions: RecruitmentPermissions = {};
  for (const row of (permissionRows ?? []) as { process_area: ProcessArea; vpra_level: VpraLevel }[]) {
    permissions[row.process_area] = row.vpra_level;
  }
  // Same gate as the page itself: the requests area, or a finance reviewer's
  // budget access. RLS would return nothing anyway — this just answers with a
  // clear 403 instead of an empty spreadsheet.
  const canView =
    hasVpraAccess(permissions.recruitmentRequests ?? "none", "view") ||
    hasVpraAccess(permissions.recruitmentBudget ?? "none", "view");
  if (!canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: requests } = await supabase
    .from("recruitment_requests")
    .select(
      "id, status, org_unit_id, job_title_id, custom_job_title, headcount, request_reason, contract_type, gender, proposed_quarter, qualifications, estimated_cost_by_requester, estimated_cost_by_hr, created_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = requests ?? [];
  const orgUnitIds = [...new Set(rows.map((r) => r.org_unit_id))];
  const jobTitleIds = [...new Set(rows.map((r) => r.job_title_id).filter(Boolean))];

  const { data: orgUnits } = orgUnitIds.length
    ? await supabase.from("org_units").select("id, name_ar").in("id", orgUnitIds)
    : { data: [] };
  const { data: jobTitles } = jobTitleIds.length
    ? await supabase.from("job_titles").select("id, name_ar").in("id", jobTitleIds as string[])
    : { data: [] };

  const orgUnitName = new Map((orgUnits ?? []).map((u) => [u.id, u.name_ar]));
  const jobTitleName = new Map((jobTitles ?? []).map((j) => [j.id, j.name_ar]));

  // Arabic labels come from the same message catalogue the table renders
  // from, so the spreadsheet cannot drift from the screen. Exports are
  // Arabic-only, like every other export in this app.
  const t = await getTranslations({ locale: "ar", namespace: "RecruitmentRequestsPage" });

  const reasonKeys: Record<string, string> = {
    vacant: "reasonVacant",
    expansion: "reasonExpansion",
    replacement: "reasonReplacement",
  };
  const contractKeys: Record<string, string> = {
    permanent: "contractPermanent",
    temporary: "contractTemporary",
    part_time: "contractPartTime",
  };
  const genderKeys: Record<string, string> = {
    Male: "genderMale",
    Female: "genderFemale",
    "": "genderUnspecified",
  };

  const views = rows.map((r) => ({
    jobTitle: r.job_title_id
      ? (jobTitleName.get(r.job_title_id) ?? "")
      : (r.custom_job_title ?? ""),
    orgUnit: orgUnitName.get(r.org_unit_id) ?? "",
    headcount: r.headcount as number,
    status: r.status as string,
    qualifications: (r.qualifications ?? null) as string | null,
    createdAt: r.created_at as string,
    reason: r.request_reason as string,
    contract: r.contract_type as string,
    gender: (r.gender ?? null) as string | null,
    quarter: (r.proposed_quarter ?? null) as number | null,
    cost: (r.estimated_cost_by_hr ?? r.estimated_cost_by_requester ?? null) as number | null,
  }));

  const params = request.nextUrl.searchParams;
  const sortParam = params.get("sort") ?? "";
  const visible = sortRequests(
    filterRequests(views, {
      query: params.get("q") ?? "",
      status: params.get("status") ?? "",
    }),
    isRequestSortOption(sortParam) ? sortParam : DEFAULT_REQUEST_SORT
  );

  const headers = [
    t("columnJobTitle"),
    t("columnOrgUnit"),
    t("columnHeadcount"),
    t("columnReason"),
    t("columnContract"),
    t("columnGender"),
    t("columnQuarter"),
    t("columnCost"),
    t("columnStatus"),
    // Two columns the table has no room for but an export is exactly the
    // place to carry.
    t("fieldQualifications"),
    t("columnCreatedAt"),
  ];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("طلبات الاحتياج");
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  for (const row of visible) {
    sheet.addRow([
      row.jobTitle,
      row.orgUnit,
      row.headcount,
      t(reasonKeys[row.reason] ?? "reasonVacant"),
      t(contractKeys[row.contract] ?? "contractPermanent"),
      t(genderKeys[row.gender ?? ""] ?? "genderUnspecified"),
      row.quarter ? `Q${row.quarter}` : "",
      row.cost ?? "",
      requestStatusLabel(row.status),
      row.qualifications ?? "",
      row.createdAt.slice(0, 10),
    ]);
  }

  sheet.columns.forEach((col, index) => {
    // The qualifications column carries prose; the rest are short values.
    col.width = index === 9 ? 40 : 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="recruitment-requests.xlsx"`,
    },
  });
}
