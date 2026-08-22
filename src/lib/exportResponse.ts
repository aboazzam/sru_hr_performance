import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

export type ExportFormat = "csv" | "xlsx";

export function parseExportFormat(value: string | null): ExportFormat {
  // Defaults to xlsx so links written before the format picker existed keep
  // returning what they always returned.
  return value === "csv" ? "csv" : "xlsx";
}

/**
 * Turn a header row + data rows into the file the caller asked for.
 *
 * Four export routes were each building their own workbook and their own
 * Content-Disposition; only the employees one had grown CSV support. This is
 * that same logic in one place, so adding a format is one change rather than
 * four — and so the BOM, the RTL sheet view and the quoting rules cannot
 * drift between screens.
 *
 * The CSV starts with a UTF-8 BOM: without it Excel on Windows reads Arabic
 * as mojibake, which is what this app's own employees export already worked
 * around.
 */
export async function buildExportResponse({
  format,
  sheetName,
  filenameBase,
  headers,
  rows,
  columnWidth = 20,
  wideColumnIndexes = [],
}: {
  format: ExportFormat;
  sheetName: string;
  filenameBase: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  columnWidth?: number;
  /** Columns carrying prose rather than short values. */
  wideColumnIndexes?: number[];
}): Promise<NextResponse> {
  if (format === "csv") {
    const escape = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
    return new NextResponse("\ufeff" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.columns.forEach((col, index) => {
    col.width = wideColumnIndexes.includes(index) ? 40 : columnWidth;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
    },
  });
}

/**
 * Keep only the requested columns, in the order the screen defines them (not
 * the order the query string happens to list). An empty or unrecognised
 * request falls back to every column — an export that silently returns
 * nothing would be worse than one that returns too much.
 */
export function selectColumns<K extends string>(
  all: readonly K[],
  requested: string | null
): K[] {
  if (!requested) return [...all];
  const wanted = new Set(requested.split(",").map((c) => c.trim()));
  const picked = all.filter((c) => wanted.has(c));
  return picked.length > 0 ? picked : [...all];
}
