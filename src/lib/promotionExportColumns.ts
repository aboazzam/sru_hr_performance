/** Every column the promotions export can emit, in screen order. */
export const PROMOTION_EXPORT_COLUMNS = [
  "employeeNumber",
  "employeeName",
  "cycle",
  "fromTitle",
  "fromGrade",
  "toTitle",
  "toGrade",
  "status",
  "careerPath",
  "createdAt",
] as const;

export type PromotionExportColumn = (typeof PROMOTION_EXPORT_COLUMNS)[number];
