/** Every column the org-structure staffing export can emit, in screen order. */
export const STAFFING_EXPORT_COLUMNS = [
  "level",
  "parent",
  "position",
  "jobTitle",
  "assigned",
  "orgUnitEmployees",
] as const;

export type StaffingExportColumn = (typeof STAFFING_EXPORT_COLUMNS)[number];
