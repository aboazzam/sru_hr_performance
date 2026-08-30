"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_UNIT_IMPORT_COLUMNS } from "@/lib/importColumns";
import { applyMapping, parseImportOptions, updatesExisting, writesField } from "@/lib/excelImportOptions";
import { orgUnitKinds, type OrgUnitKind } from "@/lib/orgUnitTypes";

export type OrgUnitsImportResult =
  | {
      status: "success";
      created: number;
      updated: number;
      skipped: number;
      rowErrors: string[];
    }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "unknown" }
  | null;

/** The Arabic label a sheet is likely to carry, mapped back to the enum. */
const KIND_BY_ARABIC: Record<string, OrgUnitKind> = {
  مجلس: "council",
  لجنة: "committee",
  أمانة: "secretariat",
  قيادة: "leadership",
  كلية: "college",
  إدارة: "department",
  ادارة: "department",
  مكتب: "office",
  مركز: "center",
  وحدة: "unit",
};

function normaliseKind(raw: string): OrgUnitKind | null {
  const value = raw.trim();
  if (value === "") return null;
  if ((orgUnitKinds as readonly string[]).includes(value)) return value as OrgUnitKind;
  return KIND_BY_ARABIC[value] ?? null;
}

function headerMap(sheet: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const header = sheet.getRow(1);
  header.eachCell((cell, index) => {
    const text = String(cell.value ?? "").trim();
    if (text !== "") map.set(text, index);
  });
  return map;
}

/**
 * Imports organisational units from a workbook.
 *
 * Rows are matched on (name, parent) rather than on the code, because
 * `unit_code` is genuinely absent on many units while
 * `UNIQUE(parent_id, name_ar)` makes the pair a real identity.
 *
 * A parent named in the sheet may itself be a row of the same sheet, and a
 * file is not required to be in tree order — so rows whose parent is not
 * resolvable yet are retried on the next pass, and the loop stops once a pass
 * places nothing new. Whatever is still unplaceable is reported by name
 * instead of being silently dropped.
 *
 * Every write goes through the caller's own client, so `org_units_insert` /
 * `org_units_update` (employeeData >= approve) stay the real gate — this
 * action adds no authority of its own.
 */
export async function importOrgUnitsExcel(
  _prev: OrgUnitsImportResult,
  formData: FormData
): Promise<OrgUnitsImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "invalid_input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { status: "error", message: "invalid_input" };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { status: "error", message: "invalid_input" };

  const options = parseImportOptions(formData);
  const cols = applyMapping(headerMap(sheet), options, ORG_UNIT_IMPORT_COLUMNS);
  const nameCol = cols.get(ORG_UNIT_IMPORT_COLUMNS.nameAr);
  if (nameCol == null) return { status: "error", message: "invalid_input" };

  type SheetRow = {
    line: number;
    nameAr: string;
    parentName: string;
    kind: OrgUnitKind | null;
    nameEn: string;
    unitCode: string;
  };

  const text = (row: ExcelJS.Row, column: number | undefined) =>
    column == null ? "" : String(row.getCell(column).value ?? "").trim();

  const rows: SheetRow[] = [];
  const rowErrors: string[] = [];
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    const nameAr = text(row, nameCol);
    if (nameAr === "") return;
    const kindRaw = text(row, cols.get(ORG_UNIT_IMPORT_COLUMNS.kind));
    const kind = normaliseKind(kindRaw);
    if (kindRaw !== "" && kind == null) {
      rowErrors.push(`${nameAr}: ${kindRaw}`);
      return;
    }
    rows.push({
      line,
      nameAr,
      parentName: text(row, cols.get(ORG_UNIT_IMPORT_COLUMNS.parentName)),
      kind,
      nameEn: text(row, cols.get(ORG_UNIT_IMPORT_COLUMNS.nameEn)),
      unitCode: text(row, cols.get(ORG_UNIT_IMPORT_COLUMNS.unitCode)),
    });
  });

  if (rows.length === 0) {
    return { status: "success", created: 0, updated: 0, skipped: 0, rowErrors };
  }

  const { data: existingData } = await supabase
    .from("org_units")
    .select("id, name_ar, parent_id, kind, name_en, unit_code")
    .is("deleted_at", null);
  const existing = (existingData ?? []) as Array<{
    id: string;
    name_ar: string;
    parent_id: string | null;
    kind: string;
    name_en: string | null;
    unit_code: string | null;
  }>;

  const idByName = new Map<string, string>();
  for (const unit of existing) idByName.set(unit.name_ar, unit.id);
  const byNameAndParent = new Map<string, (typeof existing)[number]>();
  for (const unit of existing) byNameAndParent.set(`${unit.parent_id ?? ""}|${unit.name_ar}`, unit);

  let created = 0;
  let updated = 0;
  let pending = rows;

  // Passes, not one sweep: a child may appear above its own parent in the
  // file. Each pass places whatever it can; the loop ends when a pass places
  // nothing, which is exactly the point at which the rest is unplaceable.
  for (let pass = 0; pass < rows.length + 1 && pending.length > 0; pass += 1) {
    const stillPending: SheetRow[] = [];
    let progressed = false;

    for (const row of pending) {
      const parentId = row.parentName === "" ? null : (idByName.get(row.parentName) ?? undefined);
      if (parentId === undefined) {
        stillPending.push(row);
        continue;
      }

      const match = byNameAndParent.get(`${parentId ?? ""}|${row.nameAr}`);

      if (match) {
        if (!updatesExisting(options)) {
          progressed = true;
          continue;
        }
        const patch: Record<string, string | null> = {};
        if (writesField(options, "kind") && row.kind) patch.kind = row.kind;
        if (writesField(options, "nameEn") && row.nameEn !== "") patch.name_en = row.nameEn;
        if (writesField(options, "unitCode") && row.unitCode !== "") patch.unit_code = row.unitCode;
        if (Object.keys(patch).length > 0) {
          const { data, error } = await supabase
            .from("org_units")
            .update(patch)
            .eq("id", match.id)
            .select("id");
          if (error) rowErrors.push(`${row.nameAr}: ${error.message}`);
          else if (data && data.length > 0) updated += 1;
          else rowErrors.push(row.nameAr);
        }
        progressed = true;
        continue;
      }

      // A new unit needs both a form and a code: both columns are NOT NULL
      // with no default, and there is no sensible silent value for either
      // "what kind of thing is this" or "what is it called in the system".
      if (!row.kind || row.unitCode === "") {
        rowErrors.push(row.nameAr);
        progressed = true;
        continue;
      }

      const { data, error } = await supabase
        .from("org_units")
        .insert({
          name_ar: row.nameAr,
          name_en: writesField(options, "nameEn") && row.nameEn !== "" ? row.nameEn : null,
          unit_code: row.unitCode,
          kind: row.kind,
          parent_id: parentId,
        })
        .select("id");
      if (error) {
        rowErrors.push(`${row.nameAr}: ${error.message}`);
      } else if (data && data.length > 0) {
        created += 1;
        idByName.set(row.nameAr, data[0].id);
        byNameAndParent.set(`${parentId ?? ""}|${row.nameAr}`, {
          id: data[0].id,
          name_ar: row.nameAr,
          parent_id: parentId,
          kind: row.kind,
          name_en: null,
          unit_code: null,
        });
      } else {
        rowErrors.push(row.nameAr);
      }
      progressed = true;
    }

    pending = stillPending;
    if (!progressed) break;
  }

  for (const row of pending) rowErrors.push(`${row.nameAr} → ${row.parentName}`);

  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "org_units_excel_imported",
    entity: "org_units",
    entity_id: null,
    after_data: { created, updated, rowErrorCount: rowErrors.length },
  });

  return { status: "success", created, updated, skipped: pending.length, rowErrors };
}
