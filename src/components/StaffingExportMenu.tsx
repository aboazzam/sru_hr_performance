"use client";

import { useTranslations } from "next-intl";
import { ExportMenu } from "@/components/ExportMenu";
import { STAFFING_EXPORT_COLUMNS } from "@/lib/staffingExportColumns";

const columnLabelKeys = {
  level: "positionColumnLevel",
  parent: "positionColumnParent",
  position: "positionColumnName",
  jobTitle: "positionColumnJobTitle",
  assigned: "positionColumnAssigned",
  orgUnitEmployees: "positionColumnOrgUnitEmployees",
} as const;

/**
 * Wraps the generic `ExportMenu` for the staffing screen (2026-08-30 request:
 * "اضف زر تصدير بامكانياته الثلاثة"). A dedicated client component, not
 * `<ExportMenu>` rendered directly from the (server) page — `buildHref` is a
 * plain function, and functions can't cross the server→client boundary as
 * props (confirmed live: `staffing/page.tsx` crashed with "Functions cannot
 * be passed directly to Client Components" until this was extracted, same
 * pattern every other export menu in this app already follows —
 * CompetenciesExportMenu, RecruitmentPlanExportMenu).
 */
export function StaffingExportMenu() {
  const t = useTranslations("OrgStructureStaffingPage");

  const columns = STAFFING_EXPORT_COLUMNS.map((key) => ({ key, label: t(columnLabelKeys[key]) }));

  return (
    <ExportMenu
      columns={columns}
      buildHref={(format, selected) => `/api/org-structure/staffing/export?format=${format}&columns=${selected.join(",")}`}
      filenameBase="org-structure-staffing"
      labels={{
        export: t("exportButton"),
        pdf: t("exportPdf"),
        excel: t("exportExcel"),
        csv: t("exportCsv"),
        columnsHeading: t("exportColumnsHeading"),
        columnsNote: t("exportColumnsNote"),
        confirm: t("exportConfirmButton"),
        close: t("closeButton"),
      }}
      triggerVariant="primary"
    />
  );
}
