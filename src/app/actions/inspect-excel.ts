"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export type InspectExcelResult =
  | {
      status: "success";
      sheets: Array<{ name: string; headers: string[]; rowCount: number }>;
    }
  | { status: "error"; message: "invalid_input" | "unauthenticated" | "empty" | "too_large" | "too_many_rows" };

// The limits the dialog puts on screen. They are enforced here because a
// stated limit nobody checks is just a wrong label.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: string }).text).trim();
  }
  if (typeof value === "object" && "richText" in (value as object)) {
    const rich = (value as { richText?: Array<{ text?: string }> }).richText ?? [];
    return rich.map((part) => part.text ?? "").join("").trim();
  }
  return String(value).trim();
}

/**
 * Reads an uploaded workbook's sheet names, header row and row count so the
 * import dialog can ask the caller to map columns BEFORE anything is written.
 *
 * Deliberately writes nothing and touches no table: it parses the file the
 * caller just picked and hands back its own headers. The only gate is being
 * signed in — there is no data here to authorise access to, and the real
 * import that follows is where each table's own RLS applies as it always has.
 *
 * Parsing server-side rather than in the browser keeps `exceljs` out of the
 * client bundle; it is already a server dependency of every importer.
 */
export async function inspectExcelFile(_prev: InspectExcelResult | null, formData: FormData): Promise<InspectExcelResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "invalid_input" };
  }

  if (file.size > MAX_BYTES) {
    return { status: "error", message: "too_large" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "unauthenticated" };

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { status: "error", message: "invalid_input" };
  }

  const sheets: Array<{ name: string; headers: string[]; rowCount: number }> = [];
  workbook.eachSheet((sheet) => {
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell) => {
      const text = cellText(cell.value);
      // A blank header cannot be mapped to anything and would render as an
      // unnamed row in the dialog.
      if (text !== "") headers.push(text);
    });
    // Row 1 is the header, so the data rows are what is left.
    sheets.push({ name: sheet.name, headers, rowCount: Math.max(0, sheet.rowCount - 1) });
  });

  if (sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0) > MAX_ROWS) {
    return { status: "error", message: "too_many_rows" };
  }

  if (sheets.every((s) => s.headers.length === 0)) {
    return { status: "error", message: "empty" };
  }

  return { status: "success", sheets };
}
