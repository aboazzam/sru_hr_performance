import { describe, expect, it } from "vitest";
import { cellNumber, cellText, headerIndex, missingColumns, STRATEGIC_PLAN_COLUMNS } from "./strategicPlanExcel";

describe("cellText", () => {
  it("trims and collapses whitespace", () => {
    expect(cellText("  تعزيز   التميز  ")).toBe("تعزيز التميز");
  });

  it("returns '' for null/undefined/empty", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText("   ")).toBe("");
  });

  it("reads ExcelJS rich text instead of stringifying the object", () => {
    expect(cellText({ richText: [{ text: "تعزيز " }, { text: "التميز" }] })).toBe("تعزيز التميز");
  });

  it("reads a formula cell's computed result", () => {
    expect(cellText({ formula: "A1&B1", result: 42 })).toBe("42");
  });
});

describe("cellNumber", () => {
  it("parses plain numbers and returns null for blanks", () => {
    expect(cellNumber(12.5)).toBe(12.5);
    expect(cellNumber("80")).toBe(80);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber(null)).toBeNull();
  });

  it("parses Arabic-Indic digits, thousands separators and a trailing %", () => {
    expect(cellNumber("٨٥")).toBe(85);
    expect(cellNumber("1,200")).toBe(1200);
    expect(cellNumber("10%")).toBe(10);
  });

  it("returns undefined (invalid) for non-numeric text rather than 0", () => {
    expect(cellNumber("غير محدد")).toBeUndefined();
    expect(cellNumber("12ab")).toBeUndefined();
  });
});

describe("headerIndex / missingColumns", () => {
  it("maps labels to 1-based positions regardless of column order", () => {
    const index = headerIndex(["الوزن %", "الهدف الاستراتيجي (عربي)"]);
    expect(index.get("الهدف الاستراتيجي (عربي)")).toBe(2);
    expect(index.get("الوزن %")).toBe(1);
  });

  it("reports exactly the columns a sheet is missing", () => {
    expect(missingColumns(["القيمة (عربي)"], STRATEGIC_PLAN_COLUMNS.values)).toEqual([
      "القيمة (إنجليزي)",
      "الوصف (عربي)",
      "الوصف (إنجليزي)",
      "الترتيب",
    ]);
  });

  it("reports nothing missing for a sheet exported by this app", () => {
    expect(missingColumns([...STRATEGIC_PLAN_COLUMNS.goals], STRATEGIC_PLAN_COLUMNS.goals)).toEqual([]);
  });
});
