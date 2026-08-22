/** Every column the recruitment-requests export can emit, in screen order. */
export const RECRUITMENT_REQUEST_EXPORT_COLUMNS = [
  "jobTitle",
  "orgUnit",
  "headcount",
  "reason",
  "contract",
  "gender",
  "quarter",
  "cost",
  "status",
  "qualifications",
  "createdAt",
] as const;

export type RecruitmentRequestExportColumn = (typeof RECRUITMENT_REQUEST_EXPORT_COLUMNS)[number];
