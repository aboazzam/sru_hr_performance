/**
 * Canonical list of exportable employee fields (2026-07-25: "عند التصدير
 * يطلع شاشة على شكل checkboxes لتحديد الخانات التي تحتاج تصديرها من كامل
 * النموذج وليس المعروض فقط" — every field the add/edit forms know about,
 * not just the 6 columns the table happened to show). Shared between the
 * column-picker UI (`EmployeesExportMenu.tsx`) and the export Route Handler
 * (`/api/employees/export`) so both agree on the same key set/order.
 * Arabic labels live in `messages/*.json` under `EmployeesPage.exportColumn*`
 * for i18n; this file only defines the stable keys and which ones are
 * preselected by default (the 6 columns the export already had before this
 * picker existed, so existing behavior is unchanged unless the caller
 * deliberately picks something else).
 */
export const EMPLOYEE_EXPORT_COLUMNS = [
  "employeeNumber",
  "fullNameAr",
  "fullNameEn",
  "email",
  "username",
  "orgUnit",
  "jobTitle",
  "role",
  "status",
  "account",
  "approvalStatus",
  "hireDate",
  "dateOfBirth",
  "qualification",
  "educationSpeciality",
  "mobile",
  "maritalStatus",
  "gender",
  "nationality",
  "employeeCategory",
  "insuranceCategory",
] as const;

export type EmployeeExportColumn = (typeof EMPLOYEE_EXPORT_COLUMNS)[number];

export const DEFAULT_EMPLOYEE_EXPORT_COLUMNS: EmployeeExportColumn[] = [
  "employeeNumber",
  "fullNameAr",
  "orgUnit",
  "role",
  "status",
  "account",
];

export function isEmployeeExportColumn(value: string): value is EmployeeExportColumn {
  return (EMPLOYEE_EXPORT_COLUMNS as readonly string[]).includes(value);
}
