import {
  THREE_SIXTY_RATER_GROUP_COLUMNS as RG,
  THREE_SIXTY_RATING_SCALE_COLUMNS as RS,
  THREE_SIXTY_COMPETENCY_COLUMNS as CO,
  THREE_SIXTY_ITEM_COLUMNS as IT,
} from "@/lib/importColumns";

/**
 * Sheet/column vocabulary for قالب تقييم 360's Excel round trip -- one place
 * shared by the import dialog's field-mapping UI, the import Server Action,
 * and the export Route Handler, mirroring `strategicPlanExcel.ts`'s role for
 * that module. Keys are namespaced per sheet (`raterGroup.nameAr` vs.
 * `competency.nameAr`) -- several sheets share a plain field name like
 * "name_ar", and a bare shared key would make one checkbox/mapping choice
 * silently govern every sheet that uses it (the exact trap
 * `strategicPlanExcel.ts`'s own header comment documents for "الوصف
 * (عربي)").
 *
 * Field labels are plain literal Arabic, not routed through next-intl --
 * same precedent as `STRATEGIC_PLAN_FIELDS`: these are import-tooling labels
 * for an already Arabic-only column vocabulary (the column headers
 * themselves are the literal snake_case names given directly by the project
 * owner, see `importColumns.ts`), not general UI chrome.
 */
export const THREE_SIXTY_TEMPLATE_SHEETS = {
  raterGroup: "rater_group",
  ratingScale: "rating_scale",
  competency: "competency",
  item: "item",
} as const;

export type ThreeSixtyTemplateSheetKey = keyof typeof THREE_SIXTY_TEMPLATE_SHEETS;

export interface ThreeSixtyTemplateFieldSpec {
  key: string;
  label: string;
  column: string;
  isKey?: boolean;
}

const templateFields = {
  raterGroup: [
    { key: "raterGroup.relationshipCode", label: "رمز العلاقة (relationship_code)", column: RG.relationshipCode, isKey: true },
    { key: "raterGroup.nameAr", label: "الاسم", column: RG.nameAr },
    { key: "raterGroup.groupWeightPct", label: "وزن الفئة في النتيجة (%)", column: RG.groupWeightPct },
    { key: "raterGroup.minRatersInGroup", label: "الحد الأدنى للمقيّمين", column: RG.minRatersInGroup },
    { key: "raterGroup.maxRatersInGroup", label: "الحد الأقصى للمقيّمين", column: RG.maxRatersInGroup },
    { key: "raterGroup.shownSeparately", label: "يُعرض منفصلاً في التقرير", column: RG.shownSeparately },
    { key: "raterGroup.employeeMayNominate", label: "يمكن للموظف ترشيحه", column: RG.employeeMayNominate },
  ],
  ratingScale: [
    { key: "ratingScale.scaleCode", label: "رمز المقياس (scale_code)", column: RS.scaleCode, isKey: true },
    { key: "ratingScale.optionCode", label: "رمز الخيار (option_code)", column: RS.optionCode, isKey: true },
    { key: "ratingScale.labelAr", label: "نص الخيار", column: RS.labelAr },
    { key: "ratingScale.numericValue", label: "القيمة الرقمية", column: RS.numericValue },
    { key: "ratingScale.countedInScore", label: "يُحتسب في النتيجة", column: RS.countedInScore },
  ],
  competency: [
    { key: "competency.competencyCode", label: "رمز الجدارة (competency_code)", column: CO.competencyCode, isKey: true },
    { key: "competency.nameAr", label: "الاسم", column: CO.nameAr },
    { key: "competency.definitionAr", label: "التعريف", column: CO.definitionAr },
    { key: "competency.weightPct", label: "الوزن في النتيجة الكلية (%)", column: CO.weightPct },
    { key: "competency.appliesTo", label: "يُطبَّق على", column: CO.appliesTo },
  ],
  item: [
    { key: "item.itemCode", label: "رمز العبارة (item_code)", column: IT.itemCode, isKey: true },
    { key: "item.competencyCode", label: "رمز الجدارة (competency_code)", column: IT.competencyCode },
    { key: "item.itemType", label: "نوع العبارة (rating/open_text)", column: IT.itemType },
    { key: "item.textAr", label: "نص العبارة", column: IT.textAr },
    { key: "item.raterGroups", label: "فئات المقيّمين (مفصولة بفواصل)", column: IT.raterGroups },
    { key: "item.required", label: "إلزامية", column: IT.required },
    { key: "item.reverseScored", label: "معكوسة (reverse_scored)", column: IT.reverseScored },
    { key: "item.scaleCode", label: "رمز المقياس (لعبارات rating)", column: IT.scaleCode },
    { key: "item.displayOrder", label: "ترتيب العرض", column: IT.displayOrder },
  ],
} as const satisfies Record<ThreeSixtyTemplateSheetKey, readonly ThreeSixtyTemplateFieldSpec[]>;

export const THREE_SIXTY_TEMPLATE_FIELDS: Record<ThreeSixtyTemplateSheetKey, readonly ThreeSixtyTemplateFieldSpec[]> =
  templateFields;

/** canonical field key -> the column label the import action reads it from, for one sheet. */
export function threeSixtyTemplateColumnLabels(sheet: ThreeSixtyTemplateSheetKey): Record<string, string> {
  return Object.fromEntries(THREE_SIXTY_TEMPLATE_FIELDS[sheet].map((f) => [f.key, f.column]));
}
