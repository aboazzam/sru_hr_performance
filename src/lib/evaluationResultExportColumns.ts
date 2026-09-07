/** Every column the نتائج الموظفين export can emit, in screen order. */
export const EVALUATION_RESULT_EXPORT_COLUMNS = [
  "employeeNumber",
  "employeeName",
  "orgUnit",
  "score",
  "band",
  "activities",
  "competencies",
  "bau",
  "feedback360",
] as const;

export type EvaluationResultExportColumn = (typeof EVALUATION_RESULT_EXPORT_COLUMNS)[number];
