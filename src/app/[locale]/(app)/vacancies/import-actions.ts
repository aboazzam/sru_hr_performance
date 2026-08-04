"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type VacanciesImportResult =
  | {
      status: "success";
      summary: {
        created: number;
        updated: number;
        rowErrors: string[];
      };
    }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "unknown" };

function cellText(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: string }).text).trim() || null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function headerMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const text = cellText(cell.value);
    if (text) map.set(text, colNumber);
  });
  return map;
}

const COL_JOB_TITLE = "المسمى الوظيفي";
const COL_ORG_UNIT = "الوحدة التنظيمية";
const COL_JOB_FAMILY = "العائلة الوظيفية";
const COL_STATUS = "الحالة";
const COL_REQUIREMENTS = "المتطلبات";

const REQUIRED_COLUMNS = [COL_JOB_TITLE, COL_ORG_UNIT];

/**
 * Bulk import for `vacancies` — one sheet, one row per vacancy (job title +
 * org unit, plus optional status/requirements). Mirrors the career-path and
 * job-titles imports' established shape: exact-name matching against the real
 * reference tables, per-row errors collected rather than aborting the whole
 * import, and every write through the caller's own RLS-respecting client —
 * real authorization is `vacancies_insert`'s `check_vpra('vacancies',
 * 'approve', org_unit_id)` (hr_admin-only per the seeded matrix) and
 * `vacancies_update`'s `'recommend'` bar (20260719000007), not this code.
 *
 * Job titles are matched by exact trimmed `name_ar`. `job_titles.name_ar` is
 * only unique per family (UNIQUE (job_family_id, name_ar)) — 4 of the 359 real
 * rows genuinely share a name across two families — so an optional
 * "العائلة الوظيفية" column disambiguates those; a name that still matches
 * more than one row is skipped with an explicit error rather than guessed at,
 * same conservative discipline as the career-path import. `org_units.name_ar`
 * has no uniqueness constraint either, but all 58 real rows are distinct
 * today — the same ambiguity check is applied anyway rather than assuming
 * that stays true.
 *
 * [استنتاج] Idempotency key: `vacancies` has NO unique constraint at all
 * (unlike `career_path`'s UNIQUE(from,to) or `job_titles`' UNIQUE(family,
 * name)), so re-importing the same file would otherwise silently duplicate
 * every row. (job_title_id, org_unit_id) among non-deleted rows is treated as
 * the natural key — one open posting per job title per org unit — so a
 * re-import updates the existing posting's status/requirements in place. This
 * is an inferred rule, not a documented one: an organization wanting two
 * simultaneous postings for the same title in the same unit can't express
 * that through this import.
 */
export async function importVacanciesExcel(
  _prevState: VacanciesImportResult | null,
  formData: FormData
): Promise<VacanciesImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) {
    return { status: "error", message: "unauthenticated" };
  }

  let workbook: ExcelJS.Workbook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    return { status: "error", message: "invalid_input" };
  }

  const sheet =
    workbook.worksheets.find((w) => w.name.trim() === "الشواغر") ??
    workbook.worksheets.find((w) => /شاغر|شواغر/.test(w.name)) ??
    workbook.worksheets[0];
  if (!sheet) {
    return { status: "error", message: "invalid_input" };
  }

  const cols = headerMap(sheet);
  if (REQUIRED_COLUMNS.some((name) => !cols.has(name))) {
    return { status: "error", message: "invalid_input" };
  }

  const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);

  interface ParsedRow {
    rowNumber: number;
    jobTitleNameAr: string;
    jobFamilyNameAr: string | null;
    orgUnitNameAr: string;
    status: string | null;
    requirementsAr: string | null;
  }

  const parsedRows: ParsedRow[] = [];
  const rowErrors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const jobTitleNameAr = cellText(get(row, COL_JOB_TITLE));
    const orgUnitNameAr = cellText(get(row, COL_ORG_UNIT));
    if (!jobTitleNameAr && !orgUnitNameAr) continue;

    if (!jobTitleNameAr || !orgUnitNameAr) {
      rowErrors.push(`الصف ${r}: بيانات مطلوبة ناقصة (المسمى الوظيفي/الوحدة التنظيمية) — تم التجاوز`);
      continue;
    }

    parsedRows.push({
      rowNumber: r,
      jobTitleNameAr,
      jobFamilyNameAr: cellText(get(row, COL_JOB_FAMILY)),
      orgUnitNameAr,
      status: cellText(get(row, COL_STATUS)),
      requirementsAr: cellText(get(row, COL_REQUIREMENTS)),
    });
  }

  // Reference data, read through the caller's own client — a job title or org
  // unit the caller cannot see simply won't resolve, surfacing as a per-row
  // "not found" instead of a silent cross-scope write.
  const [{ data: jobTitlesData }, { data: jobFamiliesData }, { data: orgUnitsData }] = await Promise.all([
    supabase.from("job_titles").select("id, name_ar, job_family_id").is("deleted_at", null),
    // `job_families` has no `deleted_at` column (20260716000012); `org_units`
    // does, but the create-vacancy screen's own org-unit list doesn't filter
    // on it either — matched here so the import can resolve exactly the same
    // set of units the form offers.
    supabase.from("job_families").select("id, name_ar"),
    supabase.from("org_units").select("id, name_ar"),
  ]);

  const familyNameById = new Map((jobFamiliesData ?? []).map((f) => [f.id, f.name_ar]));

  const jobTitlesByName = new Map<string, { id: string; familyNameAr: string | null }[]>();
  for (const jt of jobTitlesData ?? []) {
    const list = jobTitlesByName.get(jt.name_ar) ?? [];
    list.push({ id: jt.id, familyNameAr: familyNameById.get(jt.job_family_id) ?? null });
    jobTitlesByName.set(jt.name_ar, list);
  }

  const orgUnitIdsByName = new Map<string, string[]>();
  for (const ou of orgUnitsData ?? []) {
    const list = orgUnitIdsByName.get(ou.name_ar) ?? [];
    list.push(ou.id);
    orgUnitIdsByName.set(ou.name_ar, list);
  }

  function resolveJobTitleId(row: ParsedRow): string | null {
    const matches = jobTitlesByName.get(row.jobTitleNameAr);
    if (!matches || matches.length === 0) {
      rowErrors.push(`الصف ${row.rowNumber}: المسمى الوظيفي "${row.jobTitleNameAr}" غير موجود — تم التجاوز`);
      return null;
    }
    const narrowed = row.jobFamilyNameAr
      ? matches.filter((m) => m.familyNameAr === row.jobFamilyNameAr)
      : matches;
    if (narrowed.length === 0) {
      rowErrors.push(
        `الصف ${row.rowNumber}: المسمى الوظيفي "${row.jobTitleNameAr}" غير موجود ضمن العائلة الوظيفية "${row.jobFamilyNameAr}" — تم التجاوز`
      );
      return null;
    }
    if (narrowed.length > 1) {
      rowErrors.push(
        `الصف ${row.rowNumber}: المسمى الوظيفي "${row.jobTitleNameAr}" غير فريد (موجود في أكثر من عائلة وظيفية) — حدّد العائلة الوظيفية — تم التجاوز`
      );
      return null;
    }
    return narrowed[0].id;
  }

  function resolveOrgUnitId(row: ParsedRow): string | null {
    const ids = orgUnitIdsByName.get(row.orgUnitNameAr);
    if (!ids || ids.length === 0) {
      rowErrors.push(`الصف ${row.rowNumber}: الوحدة التنظيمية "${row.orgUnitNameAr}" غير موجودة — تم التجاوز`);
      return null;
    }
    if (ids.length > 1) {
      rowErrors.push(`الصف ${row.rowNumber}: الوحدة التنظيمية "${row.orgUnitNameAr}" غير فريدة — تم التجاوز`);
      return null;
    }
    return ids[0];
  }

  const { data: existingData } = await supabase
    .from("vacancies")
    .select("id, job_title_id, org_unit_id")
    .is("deleted_at", null);
  const existingIdByPair = new Map((existingData ?? []).map((v) => [`${v.job_title_id}::${v.org_unit_id}`, v.id]));

  const toInsert: { job_title_id: string; org_unit_id: string; status: string; requirements_ar: string | null }[] = [];
  const toUpdate: { id: string; status: string; requirements_ar: string | null }[] = [];
  const seenPairs = new Set<string>();

  for (const row of parsedRows) {
    const jobTitleId = resolveJobTitleId(row);
    const orgUnitId = resolveOrgUnitId(row);
    if (!jobTitleId || !orgUnitId) continue;

    const pair = `${jobTitleId}::${orgUnitId}`;
    if (seenPairs.has(pair)) {
      rowErrors.push(
        `الصف ${row.rowNumber} ("${row.jobTitleNameAr}" / "${row.orgUnitNameAr}"): مكرر داخل الملف نفسه — تم التجاوز`
      );
      continue;
    }
    seenPairs.add(pair);

    const status = row.status ?? "open";
    const existingId = existingIdByPair.get(pair);
    if (existingId) {
      toUpdate.push({ id: existingId, status, requirements_ar: row.requirementsAr });
    } else {
      toInsert.push({
        job_title_id: jobTitleId,
        org_unit_id: orgUnitId,
        status,
        requirements_ar: row.requirementsAr,
      });
    }
  }

  let created = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase.from("vacancies").insert(toInsert).select("id");
    if (error) {
      rowErrors.push(`الإدراج: ${error.message}`);
    } else {
      created = inserted?.length ?? 0;
    }
  }

  for (const { id, status, requirements_ar } of toUpdate) {
    const { error } = await supabase.from("vacancies").update({ status, requirements_ar }).eq("id", id);
    if (error) {
      rowErrors.push(`تحديث الشاغر ${id}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "vacancies_excel_imported",
    entity: "vacancies",
    after_data: { created, updated, rowErrorCount: rowErrors.length },
  });

  return { status: "success", summary: { created, updated, rowErrors } };
}
