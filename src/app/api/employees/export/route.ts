import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Excluded from src/proxy.ts's matcher (which skips /api entirely), so no
// locale/session-refresh happens here automatically — createClient() still
// works because Route Handlers can read the request's cookies directly,
// same as Server Components/Actions (see src/lib/supabase/server.ts).
//
// Deliberately re-runs the exact same RLS-respecting query the /employees
// page itself uses rather than accepting any row data from the client —
// an export must reflect exactly what this caller is currently authorized
// to see, not whatever happened to be rendered in their browser.
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");
  if (format !== "csv" && format !== "xlsx") {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, employee_number, full_name_ar, full_name_en, status, auth_user_id, org_units(name_ar)")
    .is("deleted_at", null)
    .order("employee_number");

  const employees = (data ?? []) as unknown as Array<{
    id: string;
    employee_number: string;
    full_name_ar: string;
    full_name_en: string | null;
    status: string;
    auth_user_id: string | null;
    org_units: { name_ar: string } | null;
  }>;

  const authUserIds = employees.map((e) => e.auth_user_id).filter((id): id is string => !!id);
  const pendingProfileIds = employees.filter((e) => !e.auth_user_id).map((e) => e.id);

  const [{ data: userRolesData }, { data: pendingRolesData }] = await Promise.all([
    authUserIds.length > 0
      ? supabase.from("user_roles").select("user_id, roles(name_ar)").in("user_id", authUserIds)
      : Promise.resolve({ data: [] as { user_id: string; roles: { name_ar: string } | null }[] }),
    pendingProfileIds.length > 0
      ? supabase.from("pending_role_assignments").select("profile_id, roles(name_ar)").in("profile_id", pendingProfileIds)
      : Promise.resolve({ data: [] as { profile_id: string; roles: { name_ar: string } | null }[] }),
  ]);

  const rolesByAuthUserId = new Map<string, string[]>();
  for (const row of (userRolesData ?? []) as unknown as { user_id: string; roles: { name_ar: string } | null }[]) {
    if (!row.roles) continue;
    const list = rolesByAuthUserId.get(row.user_id) ?? [];
    list.push(row.roles.name_ar);
    rolesByAuthUserId.set(row.user_id, list);
  }
  const pendingRolesByProfileId = new Map<string, string[]>();
  for (const row of (pendingRolesData ?? []) as unknown as { profile_id: string; roles: { name_ar: string } | null }[]) {
    if (!row.roles) continue;
    const list = pendingRolesByProfileId.get(row.profile_id) ?? [];
    list.push(row.roles.name_ar);
    pendingRolesByProfileId.set(row.profile_id, list);
  }

  const statusLabels: Record<string, string> = { active: "نشط", on_leave: "في إجازة", terminated: "منتهي الخدمة" };

  const rows = employees.map((e) => {
    const roleList = e.auth_user_id ? rolesByAuthUserId.get(e.auth_user_id) : pendingRolesByProfileId.get(e.id);
    const roleLabel = roleList && roleList.length > 0 ? roleList.join("، ") : "بلا دور";
    return {
      employeeNumber: e.employee_number,
      nameAr: e.full_name_ar,
      orgUnit: e.org_units?.name_ar ?? "",
      role: e.auth_user_id ? roleLabel : `${roleLabel} (بانتظار قبول الدعوة)`,
      status: statusLabels[e.status] ?? e.status,
      account: e.auth_user_id ? "مُفعَّل" : "بانتظار قبول الدعوة",
    };
  });

  const headers = ["الرقم الوظيفي", "الاسم", "الوحدة التنظيمية", "الدور في النظام", "الحالة", "حساب الدخول"];

  if (format === "csv") {
    const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((r) => [r.employeeNumber, r.nameAr, r.orgUnit, r.role, r.status, r.account].map(csvEscape).join(",")),
    ];
    const csv = "﻿" + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="employees.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الموظفون");
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    sheet.addRow([r.employeeNumber, r.nameAr, r.orgUnit, r.role, r.status, r.account]);
  }
  sheet.columns.forEach((col) => {
    col.width = 24;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees.xlsx"`,
    },
  });
}
