/**
 * Canonical list of exportable competency-framework fields, shared between
 * the column-picker UI (`CompetenciesExportMenu.tsx`) and the export Route
 * Handler (`/api/competencies/export`) so both agree on the same key set.
 *
 * One row per competency (flattened out of the pillar -> domain -> competency
 * -> 4 levels tree) -- the natural tabular shape every other export in this
 * app already uses, and unlike the employees list there is no PII reason to
 * default any column off, so every column starts selected.
 */
export const COMPETENCY_EXPORT_COLUMNS = [
  "pillar",
  "domain",
  "name",
  "classification",
  "jobFamily",
  "definition",
  "expectedImpact",
  "basic",
  "practitioner",
  "advanced",
  "professional",
] as const;

export type CompetencyExportColumn = (typeof COMPETENCY_EXPORT_COLUMNS)[number];

export function isCompetencyExportColumn(value: string): value is CompetencyExportColumn {
  return (COMPETENCY_EXPORT_COLUMNS as readonly string[]).includes(value);
}
