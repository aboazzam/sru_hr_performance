/**
 * Sheet/column vocabulary for the strategic-plan Excel round trip, kept in
 * ONE place so the export route and the import Server Action can never
 * drift apart: the file this app exports is exactly the file it accepts
 * back (no separate hand-built template to keep in sync, unlike the
 * employees/org-structure imports which each ship their own .xlsx).
 *
 * Vision/mission/values are GLOBAL rows (`strategic_identity` is a
 * singleton, `strategic_values` has no plan_id) -- they appear in a plan's
 * workbook because they are part of that screen, but importing them writes
 * the university-wide record, not a per-plan copy. Flagged here because the
 * sheet name gives no hint of it.
 */

export const STRATEGIC_PLAN_SHEETS = {
  identity: "الرؤية والرسالة",
  values: "القيم",
  goals: "الأهداف الاستراتيجية",
  subGoals: "الأهداف الفرعية",
  kpis: "المؤشرات",
  annualTargets: "المستهدفات السنوية",
  /** Export-only: re-importing an assignment needs position/employee
   *  resolution and its own RLS story, deliberately left to its own slice. */
  assignedTargets: "الأهداف المسندة",
} as const;

export const STRATEGIC_PLAN_COLUMNS = {
  identity: ["الرؤية (عربي)", "الرؤية (إنجليزي)", "الرسالة (عربي)", "الرسالة (إنجليزي)"],
  values: ["القيمة (عربي)", "القيمة (إنجليزي)", "الوصف (عربي)", "الوصف (إنجليزي)", "الترتيب"],
  // Goals and sub-goals carry NO unit/target/actual and no cycle: migration
  // 20260730000001 moved all measurement onto `strategic_kpis` and the
  // period onto `kpi_annual_targets`, DROPPING those columns from both
  // tables. Verified against the live database — the CREATE TABLE in
  // 20260727000005 still lists them, but the later ALTERs are what is
  // actually deployed.
  goals: ["الهدف الاستراتيجي (عربي)", "الهدف الاستراتيجي (إنجليزي)", "الوصف (عربي)", "الوصف (إنجليزي)", "الوزن %"],
  subGoals: [
    "الهدف الاستراتيجي",
    "الهدف الفرعي (عربي)",
    "الهدف الفرعي (إنجليزي)",
    "الوصف (عربي)",
    "الوصف (إنجليزي)",
    "المالك (المنصب)",
    "الوزن %",
  ],
  kpis: [
    "الهدف الاستراتيجي",
    "الهدف الفرعي",
    "المؤشر (عربي)",
    "المؤشر (إنجليزي)",
    "وحدة القياس",
    "مستهدف الخطة",
    "الوزن %",
  ],
  annualTargets: ["الهدف الاستراتيجي", "الهدف الفرعي", "المؤشر", "دورة التقييم", "القيمة المستهدفة", "القيمة الفعلية"],
  assignedTargets: [
    "الهدف الاستراتيجي",
    "الهدف الفرعي",
    "العنوان",
    "المسند إليه (منصب)",
    "المسند إليه (موظف)",
    "وحدة القياس",
    "القيمة المستهدفة",
    "القيمة الفعلية",
    "الوزن %",
    "الحالة",
  ],
} as const;

/** Trimmed, whitespace-collapsed text; "" for anything empty/absent. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    // ExcelJS hands back {richText:[...]} for styled cells and
    // {result|formula} for computed ones -- a plain String() on those
    // yields "[object Object]" and would be imported as a real title.
    const rich = (value as { richText?: Array<{ text?: string }> }).richText;
    if (Array.isArray(rich)) return rich.map((part) => part.text ?? "").join("").trim().replace(/\s+/g, " ");
    const result = (value as { result?: unknown }).result;
    if (result != null) return cellText(result);
    const text = (value as { text?: unknown }).text;
    if (text != null) return cellText(text);
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ");
}

/**
 * Numeric cell -> number | null. Accepts Arabic-Indic digits and a stray
 * "%"/comma, because a real edited sheet round-tripped through an Arabic
 * Excel install genuinely produces those; anything else is `undefined`
 * (invalid) rather than silently 0 -- a wrong target value is worse than a
 * rejected row.
 */
export function cellNumber(value: unknown): number | null | undefined {
  const text = cellText(value);
  if (text === "") return null;
  const normalized = text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬%\s]/g, "");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

/** Header row -> {columnLabel: 1-based index}, tolerant of column reordering. */
export function headerIndex(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const label = cellText(cell);
    if (label !== "" && !map.has(label)) map.set(label, i + 1);
  });
  return map;
}

/** Every column in `required` present in the sheet's header row. */
export function missingColumns(headerRow: unknown[], required: readonly string[]): string[] {
  const index = headerIndex(headerRow);
  return required.filter((label) => !index.has(label));
}
