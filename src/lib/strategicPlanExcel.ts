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
  /**
   * Programs group this plan's initiatives (2026-08-21 request). The sheet
   * carries the program's OWN fields only: its committee and which
   * initiatives it contains are edited on the program's own page, and both
   * resolve people/initiatives by name — a resolution step with its own
   * failure modes, deliberately left out rather than half-done here.
   */
  programs: "البرامج",
  /**
   * Initiatives. The targets an initiative serves live in their own link
   * table and are not in this sheet: one initiative can serve several, so a
   * flat column cannot express them without inventing a delimiter.
   */
  initiatives: "المبادرات",
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
  programs: [
    "اسم البرنامج (عربي)",
    "اسم البرنامج (إنجليزي)",
    "الوصف (عربي)",
    "الحالة",
    "تاريخ البداية",
    "تاريخ النهاية",
  ],
  initiatives: [
    "المبادرة (عربي)",
    "المبادرة (إنجليزي)",
    "الوصف (عربي)",
    "الهدف الفرعي",
    "الإدارة المالكة",
    "الحالة",
    "نسبة الإنجاز %",
    "تاريخ البداية",
    "تاريخ النهاية",
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

/**
 * Date cell -> "YYYY-MM-DD" | null (empty) | undefined (invalid).
 *
 * Three real shapes reach this: a true Date (ExcelJS parses a date-formatted
 * cell into one), the ISO text this app exports, and D/M/YYYY typed by hand
 * in an Arabic Excel — including Arabic-Indic digits.
 *
 * A Date is read through its **UTC** components, never `toISOString().slice`
 * on a local-time value: ExcelJS builds date cells at UTC midnight, and
 * reading them locally in a negative-offset zone moves the calendar day back
 * by one — a bug this project already shipped once, in the org-structure
 * import.
 */
export function cellDateIso(value: unknown): string | null | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    const y = String(value.getUTCFullYear()).padStart(4, "0");
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = cellText(value).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (text === "") return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  const parts = iso
    ? { y: iso[1], m: iso[2], d: iso[3] }
    : dmy
      ? { y: dmy[3], m: dmy[2], d: dmy[1] }
      : null;
  if (!parts) return undefined;

  const y = Number(parts.y);
  const m = Number(parts.m);
  const d = Number(parts.d);
  // Round-tripped through UTC so "2026-02-31" is rejected rather than
  // silently rolling over into March.
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return undefined;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

/**
 * The plan workbook's columns as MAPPABLE FIELDS, so its import gets the same
 * column-mapping and field-picking step every other import has (2026-08-24).
 *
 * It was left out at first on the reasoning that this workbook is this app's
 * own export format, so nothing needs mapping. That was wrong in practice: a
 * caller edits the file in Excel, renames or reorders a column, and the sheet
 * was then rejected wholesale for a "missing column" with no way to say which
 * of their columns meant what.
 *
 * Two things make this file different from the single-sheet imports, and both
 * are why fields are declared PER SHEET rather than as one flat list:
 *
 *  1. Headers repeat across sheets — "الوصف (عربي)" appears in five of them,
 *     "الهدف الاستراتيجي" in three. A flat mapping keyed by header text alone
 *     would make one choice silently govern every sheet that shares the name.
 *  2. Each sheet writes a different table, so "which fields may be written"
 *     is only meaningful within a sheet.
 *
 * `column` is the database column a field writes, where it writes one
 * directly; fields that resolve to something else first (a parent goal, an
 * owning position, an evaluation cycle) have none, and are identity/lookup
 * columns rather than payload.
 */
export interface StrategicPlanFieldSpec {
  /** Globally unique: "<sheetKey>.<name>". */
  key: string;
  /** The column label as this workbook writes it. */
  label: string;
  /** The database column written, when the field maps to one directly. */
  column?: string;
  /** Identifies the row (or resolves its parent): always written. */
  isKey?: boolean;
}

const planFields = {
  identity: [
    { key: "identity.visionAr", label: "الرؤية (عربي)", column: "vision_ar" },
    { key: "identity.visionEn", label: "الرؤية (إنجليزي)", column: "vision_en" },
    { key: "identity.missionAr", label: "الرسالة (عربي)", column: "mission_ar" },
    { key: "identity.missionEn", label: "الرسالة (إنجليزي)", column: "mission_en" },
  ],
  values: [
    { key: "values.titleAr", label: "القيمة (عربي)", column: "title_ar", isKey: true },
    { key: "values.titleEn", label: "القيمة (إنجليزي)", column: "title_en" },
    { key: "values.descriptionAr", label: "الوصف (عربي)", column: "description_ar" },
    { key: "values.descriptionEn", label: "الوصف (إنجليزي)", column: "description_en" },
    { key: "values.order", label: "الترتيب", column: "display_order" },
  ],
  goals: [
    { key: "goals.titleAr", label: "الهدف الاستراتيجي (عربي)", column: "title_ar", isKey: true },
    { key: "goals.titleEn", label: "الهدف الاستراتيجي (إنجليزي)", column: "title_en" },
    { key: "goals.descriptionAr", label: "الوصف (عربي)", column: "description_ar" },
    { key: "goals.descriptionEn", label: "الوصف (إنجليزي)", column: "description_en" },
    { key: "goals.weight", label: "الوزن %", column: "weight" },
  ],
  subGoals: [
    { key: "subGoals.goal", label: "الهدف الاستراتيجي", isKey: true },
    { key: "subGoals.titleAr", label: "الهدف الفرعي (عربي)", column: "title_ar", isKey: true },
    { key: "subGoals.titleEn", label: "الهدف الفرعي (إنجليزي)", column: "title_en" },
    { key: "subGoals.descriptionAr", label: "الوصف (عربي)", column: "description_ar" },
    { key: "subGoals.descriptionEn", label: "الوصف (إنجليزي)", column: "description_en" },
    { key: "subGoals.owner", label: "المالك (المنصب)", column: "owner_position_id" },
    { key: "subGoals.weight", label: "الوزن %", column: "weight" },
  ],
  kpis: [
    { key: "kpis.goal", label: "الهدف الاستراتيجي", isKey: true },
    { key: "kpis.subGoal", label: "الهدف الفرعي", isKey: true },
    { key: "kpis.titleAr", label: "المؤشر (عربي)", column: "title_ar", isKey: true },
    { key: "kpis.titleEn", label: "المؤشر (إنجليزي)", column: "title_en" },
    { key: "kpis.unit", label: "وحدة القياس", column: "unit_ar" },
    { key: "kpis.planTarget", label: "مستهدف الخطة", column: "plan_target_value" },
    { key: "kpis.weight", label: "الوزن %", column: "weight" },
  ],
  annualTargets: [
    { key: "annualTargets.goal", label: "الهدف الاستراتيجي", isKey: true },
    { key: "annualTargets.subGoal", label: "الهدف الفرعي", isKey: true },
    { key: "annualTargets.kpi", label: "المؤشر", isKey: true },
    { key: "annualTargets.cycle", label: "دورة التقييم", isKey: true },
    { key: "annualTargets.target", label: "القيمة المستهدفة", column: "target_value" },
    { key: "annualTargets.actual", label: "القيمة الفعلية", column: "actual_value" },
  ],
  programs: [
    { key: "programs.nameAr", label: "اسم البرنامج (عربي)", column: "name_ar", isKey: true },
    { key: "programs.nameEn", label: "اسم البرنامج (إنجليزي)", column: "name_en" },
    { key: "programs.descriptionAr", label: "الوصف (عربي)", column: "description_ar" },
    { key: "programs.status", label: "الحالة", column: "status" },
    { key: "programs.startDate", label: "تاريخ البداية", column: "start_date" },
    { key: "programs.endDate", label: "تاريخ النهاية", column: "end_date" },
  ],
  initiatives: [
    { key: "initiatives.titleAr", label: "المبادرة (عربي)", column: "title_ar", isKey: true },
    { key: "initiatives.titleEn", label: "المبادرة (إنجليزي)", column: "title_en" },
    { key: "initiatives.descriptionAr", label: "الوصف (عربي)", column: "description_ar" },
    { key: "initiatives.subGoal", label: "الهدف الفرعي", column: "sub_goal_id" },
    { key: "initiatives.owner", label: "الإدارة المالكة", column: "owner_org_unit_id" },
    { key: "initiatives.status", label: "الحالة", column: "status_code" },
    { key: "initiatives.progress", label: "نسبة الإنجاز %", column: "progress_percent" },
    { key: "initiatives.startDate", label: "تاريخ البداية", column: "start_date" },
    { key: "initiatives.endDate", label: "تاريخ النهاية", column: "end_date" },
  ],
} as const;

export type StrategicPlanSheetKey = keyof typeof planFields;

/** Widened to the spec type: the literal inference above drops `column`/`isKey`
 *  from the members that lack them, which makes the union unusable. */
export const STRATEGIC_PLAN_FIELDS: Record<StrategicPlanSheetKey, readonly StrategicPlanFieldSpec[]> = planFields;

/** Canonical field key -> the column label that sheet expects. */
export function planSheetColumnLabels(sheet: StrategicPlanSheetKey): Record<string, string> {
  return Object.fromEntries(STRATEGIC_PLAN_FIELDS[sheet].map((f) => [f.key, f.label]));
}

/**
 * Drops the payload columns whose field the caller did not tick.
 *
 * Dropping rather than blanking is the whole point: an unticked field must be
 * left exactly as the platform has it, and writing `null` for it would erase a
 * real value instead of leaving it alone. Key fields are never dropped — the
 * importer cannot find the row without them.
 */
export function pickWritableColumns<T extends Record<string, unknown>>(
  payload: T,
  sheet: StrategicPlanSheetKey,
  isWritable: (fieldKey: string) => boolean
): Partial<T> {
  const byColumn = new Map(
    STRATEGIC_PLAN_FIELDS[sheet].filter((f) => "column" in f && f.column).map((f) => [f.column as string, f])
  );
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(payload)) {
    const field = byColumn.get(column);
    // A column no field declares (created_by, plan_id, a resolved parent id)
    // is bookkeeping, not something the caller chose — always kept.
    if (!field || field.isKey || isWritable(field.key)) out[column] = value;
  }
  return out as Partial<T>;
}
