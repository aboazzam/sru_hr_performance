/** Every column the org units export can emit, in screen order. */
export const ORG_UNIT_EXPORT_COLUMNS = [
  "nameAr",
  "nameEn",
  "kind",
  "type",
  "parent",
  "unitCode",
  "depth",
  "childCount",
] as const;

export type OrgUnitExportColumn = (typeof ORG_UNIT_EXPORT_COLUMNS)[number];
