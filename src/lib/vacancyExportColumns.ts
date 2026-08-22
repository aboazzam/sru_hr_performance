/** Every column the vacancies export can emit, in screen order. */
export const VACANCY_EXPORT_COLUMNS = [
  "jobTitle",
  "grade",
  "orgUnit",
  "status",
  "announced",
  "scope",
  "plan",
  "requirements",
  "createdAt",
] as const;

export type VacancyExportColumn = (typeof VACANCY_EXPORT_COLUMNS)[number];
