"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import {
  THREE_SIXTY_RATER_GROUP_COLUMNS as RG,
  THREE_SIXTY_RATING_SCALE_COLUMNS as RS,
  THREE_SIXTY_COMPETENCY_COLUMNS as CO,
  THREE_SIXTY_ITEM_COLUMNS as IT,
} from "@/lib/importColumns";

export type ImportThreeSixtyTemplateResult =
  | {
      status: "success";
      summary: {
        raterGroups: number;
        ratingScaleOptions: number;
        competencies: number;
        items: number;
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

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Accepts common truthy spellings (TRUE/true/1/نعم/صح) -- everything else is false. */
function cellBool(value: ExcelJS.CellValue, fallback: boolean): boolean {
  const text = cellText(value);
  if (text === null) return fallback;
  return ["true", "1", "yes", "نعم", "صح"].includes(text.trim().toLowerCase());
}

function headerMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const text = cellText(cell.value);
    if (text) map.set(text, colNumber);
  });
  return map;
}

function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find((w) => w.name.trim() === name);
}

/**
 * Screen 1's "استيراد ملف القالب" -- one workbook, four sheets, one per
 * global catalog table (`rater_group`/`rating_scale`/`competency`/`item`).
 * Cycles themselves are NOT part of this import (created via their own
 * form) -- see 20260902000002's header for why these four tables are
 * cycle-independent, reusable reference data.
 *
 * Deliberately the SIMPLER, single-step, fixed-header import shape (like
 * this project's earlier importers before the 2026-08-24 shared
 * `ExcelImportDialog` 2-step column-mapping UI existed) rather than that
 * newer dialog -- four sheets' worth of mapping UI would be a large,
 * separate investment relative to the rest of this already-large module;
 * flagged as a reasonable follow-up if column remapping is ever needed.
 * Column headers ARE the literal snake_case field names given directly by
 * the project owner (see `importColumns.ts`'s own header comment).
 *
 * Every sheet is upserted by its own natural key (never deleted from) --
 * same "add/update only, never remove by omission" discipline as every
 * other import in this app. Sheets are processed in dependency order
 * (rating_scale, rater_group, competency, then item, which references the
 * first three) so a brand-new template can be imported in one pass.
 */
export async function importThreeSixtyTemplateExcel(
  _prevState: ImportThreeSixtyTemplateResult | null,
  formData: FormData
): Promise<ImportThreeSixtyTemplateResult> {
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

  const rowErrors: string[] = [];
  let raterGroupsWritten = 0;
  let ratingScaleOptionsWritten = 0;
  let competenciesWritten = 0;
  let itemsWritten = 0;

  // ---- rating_scale ---------------------------------------------------
  const ratingScaleSheet = findSheet(workbook, "rating_scale");
  if (ratingScaleSheet) {
    const cols = headerMap(ratingScaleSheet);
    const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);
    const { data: existingData } = await supabase
      .from("three_sixty_rating_scale_options")
      .select("id, scale_code, option_code")
      .is("deleted_at", null);
    const existingByKey = new Map((existingData ?? []).map((r) => [`${r.scale_code}::${r.option_code}`, r.id]));

    for (let r = 2; r <= ratingScaleSheet.rowCount; r++) {
      const row = ratingScaleSheet.getRow(r);
      const scaleCode = cellText(get(row, RS.scaleCode));
      const optionCode = cellText(get(row, RS.optionCode));
      const labelAr = cellText(get(row, RS.labelAr));
      const numericValue = cellNumber(get(row, RS.numericValue));
      if (!scaleCode && !optionCode && !labelAr) continue;
      if (!scaleCode || !optionCode || !labelAr || numericValue === null) {
        rowErrors.push(`rating_scale الصف ${r}: بيانات ناقصة (scale_code/option_code/label_ar/numeric_value) — تم التجاوز`);
        continue;
      }
      const patch = {
        scale_code: scaleCode,
        option_code: optionCode,
        label_ar: labelAr,
        numeric_value: numericValue,
        counted_in_score: cellBool(get(row, RS.countedInScore), true),
      };
      const key = `${scaleCode}::${optionCode}`;
      const existingId = existingByKey.get(key);
      const { error } = existingId
        ? await supabase.from("three_sixty_rating_scale_options").update(patch).eq("id", existingId)
        : await supabase.from("three_sixty_rating_scale_options").insert(patch);
      if (error) {
        rowErrors.push(`rating_scale الصف ${r}: ${error.message}`);
      } else {
        ratingScaleOptionsWritten += 1;
      }
    }
  }

  // ---- rater_group ------------------------------------------------------
  const raterGroupSheet = findSheet(workbook, "rater_group");
  if (raterGroupSheet) {
    const cols = headerMap(raterGroupSheet);
    const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);
    const { data: existingData } = await supabase
      .from("three_sixty_rater_groups")
      .select("id, relationship_code")
      .is("deleted_at", null);
    const existingByCode = new Map((existingData ?? []).map((r) => [r.relationship_code, r.id]));

    for (let r = 2; r <= raterGroupSheet.rowCount; r++) {
      const row = raterGroupSheet.getRow(r);
      const relationshipCode = cellText(get(row, RG.relationshipCode));
      const nameAr = cellText(get(row, RG.nameAr));
      if (!relationshipCode && !nameAr) continue;
      if (!relationshipCode || !nameAr) {
        rowErrors.push(`rater_group الصف ${r}: بيانات ناقصة (relationship_code/name_ar) — تم التجاوز`);
        continue;
      }
      const patch = {
        relationship_code: relationshipCode,
        name_ar: nameAr,
        group_weight_pct: cellNumber(get(row, RG.groupWeightPct)) ?? 0,
        min_raters_in_group: cellNumber(get(row, RG.minRatersInGroup)) ?? 0,
        max_raters_in_group: cellNumber(get(row, RG.maxRatersInGroup)),
        shown_separately: cellBool(get(row, RG.shownSeparately), false),
        employee_may_nominate: cellBool(get(row, RG.employeeMayNominate), false),
      };
      const existingId = existingByCode.get(relationshipCode);
      const { error } = existingId
        ? await supabase.from("three_sixty_rater_groups").update(patch).eq("id", existingId)
        : await supabase.from("three_sixty_rater_groups").insert(patch);
      if (error) {
        rowErrors.push(`rater_group الصف ${r}: ${error.message}`);
      } else {
        raterGroupsWritten += 1;
      }
    }
  }

  // ---- competency ---------------------------------------------------
  const competencySheet = findSheet(workbook, "competency");
  if (competencySheet) {
    const cols = headerMap(competencySheet);
    const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);
    const { data: existingData } = await supabase
      .from("three_sixty_competencies")
      .select("id, competency_code")
      .is("deleted_at", null);
    const existingByCode = new Map((existingData ?? []).map((r) => [r.competency_code, r.id]));

    for (let r = 2; r <= competencySheet.rowCount; r++) {
      const row = competencySheet.getRow(r);
      const competencyCode = cellText(get(row, CO.competencyCode));
      const nameAr = cellText(get(row, CO.nameAr));
      if (!competencyCode && !nameAr) continue;
      if (!competencyCode || !nameAr) {
        rowErrors.push(`competency الصف ${r}: بيانات ناقصة (competency_code/name_ar) — تم التجاوز`);
        continue;
      }
      const patch = {
        competency_code: competencyCode,
        name_ar: nameAr,
        definition_ar: cellText(get(row, CO.definitionAr)),
        weight_pct: cellNumber(get(row, CO.weightPct)),
        applies_to: cellText(get(row, CO.appliesTo)),
      };
      const existingId = existingByCode.get(competencyCode);
      const { error } = existingId
        ? await supabase.from("three_sixty_competencies").update(patch).eq("id", existingId)
        : await supabase.from("three_sixty_competencies").insert(patch);
      if (error) {
        rowErrors.push(`competency الصف ${r}: ${error.message}`);
      } else {
        competenciesWritten += 1;
      }
    }
  }

  // ---- item ---------------------------------------------------------
  const itemSheet = findSheet(workbook, "item");
  if (itemSheet) {
    const cols = headerMap(itemSheet);
    const get = (row: ExcelJS.Row, col: string) => (cols.has(col) ? row.getCell(cols.get(col)!).value : null);
    const [{ data: competencyRows }, { data: existingItems }] = await Promise.all([
      supabase.from("three_sixty_competencies").select("id, competency_code").is("deleted_at", null),
      supabase.from("three_sixty_items").select("id, item_code").is("deleted_at", null),
    ]);
    const competencyIdByCode = new Map((competencyRows ?? []).map((c) => [c.competency_code, c.id]));
    const existingItemByCode = new Map((existingItems ?? []).map((i) => [i.item_code, i.id]));

    for (let r = 2; r <= itemSheet.rowCount; r++) {
      const row = itemSheet.getRow(r);
      const itemCode = cellText(get(row, IT.itemCode));
      const textAr = cellText(get(row, IT.textAr));
      const competencyCode = cellText(get(row, IT.competencyCode));
      if (!itemCode && !textAr) continue;
      if (!itemCode || !textAr || !competencyCode) {
        rowErrors.push(`item الصف ${r}: بيانات ناقصة (item_code/competency_code/text_ar) — تم التجاوز`);
        continue;
      }
      const competencyId = competencyIdByCode.get(competencyCode);
      if (!competencyId) {
        rowErrors.push(`item الصف ${r}: الجدارة "${competencyCode}" غير موجودة — تم التجاوز`);
        continue;
      }
      const itemType = cellText(get(row, IT.itemType)) === "open_text" ? "open_text" : "rating";
      const raterGroupsRaw = cellText(get(row, IT.raterGroups)) ?? "";
      const raterGroups = raterGroupsRaw
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (raterGroups.length === 0) {
        rowErrors.push(`item الصف ${r}: عمود rater_groups فارغ — تم التجاوز`);
        continue;
      }
      const scaleCode = cellText(get(row, IT.scaleCode));
      if (itemType === "rating" && !scaleCode) {
        rowErrors.push(`item الصف ${r}: عبارة من نوع rating بلا scale_code — تم التجاوز`);
        continue;
      }
      const patch = {
        item_code: itemCode,
        competency_id: competencyId,
        item_type: itemType,
        text_ar: textAr,
        rater_groups: raterGroups,
        required: cellBool(get(row, IT.required), true),
        reverse_scored: cellBool(get(row, IT.reverseScored), false),
        scale_code: itemType === "rating" ? scaleCode : null,
        display_order: cellNumber(get(row, IT.displayOrder)) ?? 0,
      };
      const existingId = existingItemByCode.get(itemCode);
      const { error } = existingId
        ? await supabase.from("three_sixty_items").update(patch).eq("id", existingId)
        : await supabase.from("three_sixty_items").insert(patch);
      if (error) {
        rowErrors.push(`item الصف ${r}: ${error.message}`);
      } else {
        itemsWritten += 1;
      }
    }
  }

  if (
    !ratingScaleSheet &&
    !raterGroupSheet &&
    !competencySheet &&
    !itemSheet
  ) {
    return { status: "error", message: "invalid_input" };
  }

  return {
    status: "success",
    summary: {
      raterGroups: raterGroupsWritten,
      ratingScaleOptions: ratingScaleOptionsWritten,
      competencies: competenciesWritten,
      items: itemsWritten,
      rowErrors,
    },
  };
}
