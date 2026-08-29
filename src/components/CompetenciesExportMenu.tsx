"use client";

import { useTranslations } from "next-intl";
import { ExportMenu } from "@/components/ExportMenu";
import { COMPETENCY_EXPORT_COLUMNS } from "@/lib/competencyExportColumns";
import { behavioralLevelLabels } from "@/lib/data/competencies";

/**
 * Replaces the plain PrintButton on /competencies (2026-08-29 request: "احذف
 * زر الطباعة واضف زر التصدير ... excel, vcs, pdf"), reusing the same generic
 * `ExportMenu` every other list in this app already uses -- PDF stays
 * `window.print()` (this project has no PDF library, `sru-print.css` exists
 * for exactly this), Excel/CSV hit the real Route Handler.
 */
export function CompetenciesExportMenu() {
  const t = useTranslations("CompetenciesPage");

  const columns = COMPETENCY_EXPORT_COLUMNS.map((key) => ({
    key,
    label:
      key === "pillar"
        ? t("exportColumnPillar")
        : key === "domain"
          ? t("exportColumnDomain")
          : key === "name"
            ? t("competencyNameArLabel")
            : key === "classification"
              ? t("competencyClassificationLabel")
              : key === "jobFamily"
                ? t("jobFamilyLabel")
                : key === "definition"
                  ? t("definitionArLabel")
                  : key === "expectedImpact"
                    ? t("expectedImpactArLabel")
                    : behavioralLevelLabels[key],
  }));

  return (
    <ExportMenu
      columns={columns}
      buildHref={(format, selected) => `/api/competencies/export?format=${format}&columns=${selected.join(",")}`}
      filenameBase="competencies"
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
    />
  );
}
