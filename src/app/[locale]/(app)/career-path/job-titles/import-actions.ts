"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type JobTitlesImportResult =
  | {
      status: "success";
      summary: {
        created: number;
        updated: number;
        rowErrors: string[];
      };
    }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "unknown" };

const CATEGORY_LABELS: Record<string, "leadership" | "academic" | "admin" | "technical" | "labor"> = {
  "قيادية": "leadership",
  "أكاديمية": "academic",
  "إدارية": "admin",
  "تقنية": "technical",
  "عمالية": "labor",
  leadership: "leadership",
  academic: "academic",
  admin: "admin",
  technical: "technical",
  labor: "labor",
};

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

function requireColumns(map: Map<string, number>, names: string[]): string | null {
  for (const name of names) {
    if (!map.has(name)) return name;
  }
  return null;
}

const REQUIRED_COLUMNS = ["اسم المسمى الوظيفي", "العائلة الوظيفية", "الدرجة", "الفئة"];
const BATCH_SIZE = 50;

/**
 * Bulk import for `job_titles` — one sheet, one row per job title. Column
 * set mirrors the fields `CreateJobTitleForm`/`JobTitleCoreForm` already
 * expose (name_ar/name_en/family/grade/category/qualification/description),
 * not job_title_competencies or career_path edges — those stay per-job-title
 * screens, same scoping choice already made for the org-structure import
 * (staffing there is embedded, but role/competency assignment on this table
 * would need a separate matching problem this sheet shape can't express
 * cleanly without a source file to design against).
 *
 * Every write goes through the caller's own RLS-respecting client, exactly
 * like importOrgStructureExcel — real authorization is job_titles_insert/
 * update's own `careerPath>=prepare` RLS, not this action's code. A row that
 * RLS rejects surfaces as a per-row error in the summary rather than
 * aborting the whole import, same discipline as every other bulk-error
 * collection in this app.
 *
 * job_titles has a PLAIN `UNIQUE(job_family_id, name_ar)` (not a partial
 * index, unlike org_structure_positions.external_code/evaluation_scores/
 * calibration_results), so this doesn't need the select-then-insert-or-update
 * workaround purely to dodge an ON CONFLICT limitation — but selecting
 * existing rows first is still needed to (a) know create-vs-update counts,
 * and (b) reset career_content_status to 'draft' on an update, mirroring
 * updateJobTitleCore's own behavior for any manual edit.
 */
export async function importJobTitlesExcel(
  _prevState: JobTitlesImportResult | null,
  formData: FormData
): Promise<JobTitlesImportResult> {
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
    workbook.worksheets.find((w) => w.name.trim() === "المسميات الوظيفية") ??
    workbook.worksheets.find((w) => /مسميات|وظيف/.test(w.name)) ??
    workbook.worksheets[0];
  if (!sheet) {
    return { status: "error", message: "invalid_input" };
  }

  const cols = headerMap(sheet);
  const missingColumn = requireColumns(cols, REQUIRED_COLUMNS);
  if (missingColumn) {
    return { status: "error", message: "invalid_input" };
  }

  const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);

  interface ParsedRow {
    rowNumber: number;
    nameAr: string;
    nameEn: string | null;
    familyNameAr: string;
    gradeLevel: number;
    category: "leadership" | "academic" | "admin" | "technical" | "labor";
    qualificationRequired: string | null;
    descriptionAr: string | null;
  }

  const parsedRows: ParsedRow[] = [];
  const rowErrors: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nameAr = cellText(get(row, "اسم المسمى الوظيفي"));
    if (!nameAr) continue;

    const familyNameAr = cellText(get(row, "العائلة الوظيفية"));
    const gradeText = cellText(get(row, "الدرجة"));
    const categoryText = cellText(get(row, "الفئة"));

    if (!familyNameAr || !gradeText || !categoryText) {
      rowErrors.push(`الصف ${r} ("${nameAr}"): بيانات مطلوبة ناقصة — تم التجاوز`);
      continue;
    }

    const gradeLevel = parseInt(gradeText, 10);
    if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 16) {
      rowErrors.push(`الصف ${r} ("${nameAr}"): درجة غير صالحة "${gradeText}" — تم التجاوز`);
      continue;
    }

    const category = CATEGORY_LABELS[categoryText.trim()];
    if (!category) {
      rowErrors.push(`الصف ${r} ("${nameAr}"): فئة غير معروفة "${categoryText}" — تم التجاوز`);
      continue;
    }

    parsedRows.push({
      rowNumber: r,
      nameAr,
      nameEn: cellText(get(row, "الاسم بالإنجليزية")),
      familyNameAr,
      gradeLevel,
      category,
      qualificationRequired: cellText(get(row, "المؤهل المطلوب")),
      descriptionAr: cellText(get(row, "الوصف الوظيفي")),
    });
  }

  const { data: familiesData } = await supabase.from("job_families").select("id, name_ar");
  const familyIdByName = new Map((familiesData ?? []).map((f) => [f.name_ar.trim(), f.id]));

  const { data: existingTitlesData } = await supabase
    .from("job_titles")
    .select("id, job_family_id, name_ar")
    .is("deleted_at", null);
  const existingIdByKey = new Map((existingTitlesData ?? []).map((t) => [`${t.job_family_id}::${t.name_ar}`, t.id]));

  const toInsert: {
    job_family_id: string;
    name_ar: string;
    name_en: string | null;
    grade_level: number;
    category: string;
    qualification_required: string | null;
    description_ar: string | null;
  }[] = [];
  const toUpdate: { id: string; row: ParsedRow }[] = [];

  for (const row of parsedRows) {
    const familyId = familyIdByName.get(row.familyNameAr.trim());
    if (!familyId) {
      rowErrors.push(`الصف ${row.rowNumber} ("${row.nameAr}"): العائلة الوظيفية "${row.familyNameAr}" غير موجودة — تم التجاوز`);
      continue;
    }
    const existingId = existingIdByKey.get(`${familyId}::${row.nameAr}`);
    if (existingId) {
      toUpdate.push({ id: existingId, row });
    } else {
      toInsert.push({
        job_family_id: familyId,
        name_ar: row.nameAr,
        name_en: row.nameEn,
        grade_level: row.gradeLevel,
        category: row.category,
        qualification_required: row.qualificationRequired,
        description_ar: row.descriptionAr,
      });
    }
  }

  let created = 0;
  let updated = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { data: inserted, error } = await supabase.from("job_titles").insert(batch).select("id");
    if (error) {
      rowErrors.push(`دفعة الإدراج ${i / BATCH_SIZE + 1}: ${error.message}`);
    } else {
      created += inserted?.length ?? 0;
    }
  }

  for (const { id, row } of toUpdate) {
    const { error } = await supabase
      .from("job_titles")
      .update({
        name_en: row.nameEn,
        grade_level: row.gradeLevel,
        category: row.category,
        qualification_required: row.qualificationRequired,
        description_ar: row.descriptionAr,
        career_content_status: "draft",
      })
      .eq("id", id);
    if (error) {
      rowErrors.push(`الصف ${row.rowNumber} ("${row.nameAr}"): ${error.message}`);
    } else {
      updated += 1;
    }
  }

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "job_titles_excel_imported",
    entity: "job_titles",
    after_data: { created, updated, rowErrorCount: rowErrors.length },
  });

  return { status: "success", summary: { created, updated, rowErrors } };
}
