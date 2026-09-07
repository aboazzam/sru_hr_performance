"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { RowLink } from "@/components/RowLink";
import { ExportMenu } from "@/components/ExportMenu";
import { EVALUATION_RESULT_EXPORT_COLUMNS } from "@/lib/evaluationResultExportColumns";
import {
  DEFAULT_EVALUATION_RESULT_SORT,
  EVALUATION_RESULT_SORT_OPTIONS,
  filterEvaluationResults,
  isEvaluationResultSortOption,
  sortEvaluationResults,
  type EvaluationResultSortOption,
} from "@/lib/evaluationResultTable";
import { RATING_BANDS, type RatingBandId } from "@/lib/ratingBands";
import type { EvaluationMethod } from "@/lib/evaluationCycle";

export interface EvaluationResultRowView {
  evaluationId: string;
  employeeNumber: string | null;
  employeeName: string | null;
  orgUnitName: string | null;
  score: number | null;
  bandId: RatingBandId | null;
  bandLabel: string | null;
  methodScores: Partial<Record<EvaluationMethod, number | null>>;
}

const sortLabelKeys: Record<EvaluationResultSortOption, string> = {
  scoreDesc: "sortScoreDesc",
  scoreAsc: "sortScoreAsc",
  nameAsc: "sortName",
  orgUnitAsc: "sortOrgUnit",
};

/**
 * The نتائج الموظفين table (نتائج التقييم module): live hamza-insensitive
 * search, a rating-band filter, sort, and export — same shape as
 * VacanciesTable/PromotionsTable. Filtering/sorting is in-memory over
 * already-fetched rows (this list is small — one cycle's worth of
 * employees), the established convention across this app.
 */
export function EvaluationResultsTable({
  results,
  methodLabels,
  cycleName,
  printedOn,
}: {
  results: EvaluationResultRowView[];
  methodLabels: Record<EvaluationMethod, string>;
  cycleName: string;
  /** Formatted server-side (display timezone) — a Date created in this client
   *  component would differ between the server and client renders. */
  printedOn: string;
}) {
  const t = useTranslations("EvaluationResultsEmployeesPage");
  const [query, setQuery] = useState("");
  const [bandFilter, setBandFilter] = useState("");
  const [sort, setSort] = useState<EvaluationResultSortOption>(DEFAULT_EVALUATION_RESULT_SORT);

  const filtered = useMemo(
    () => filterEvaluationResults(results, { query, bandId: bandFilter }),
    [results, query, bandFilter]
  );
  const visible = useMemo(() => sortEvaluationResults(filtered, sort), [filtered, sort]);

  // The export re-fetches on the server through the caller's own RLS; these
  // params only tell it to narrow the same way the screen currently is.
  const exportParams = new URLSearchParams();
  if (query.trim() !== "") exportParams.set("q", query.trim());
  if (bandFilter !== "") exportParams.set("band", bandFilter);
  if (sort !== DEFAULT_EVALUATION_RESULT_SORT) exportParams.set("sort", sort);
  const exportColumnLabels: Record<string, string> = {
    employeeNumber: t("columnEmployeeNumber"),
    employeeName: t("columnEmployeeName"),
    orgUnit: t("columnOrgUnit"),
    score: t("columnScore"),
    band: t("columnBand"),
    activities: methodLabels.activities,
    competencies: methodLabels.competencies,
    bau: methodLabels.bau,
    feedback360: methodLabels.feedback360,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="no-print"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          style={{ minWidth: 260, flex: "1 1 260px" }}
        />
        <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)} aria-label={t("filterByBand")}>
          <option value="">{t("allBands")}</option>
          {RATING_BANDS.map((band) => (
            <option key={band.id} value={band.id}>
              {band.labelAr}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(isEvaluationResultSortOption(e.target.value) ? e.target.value : DEFAULT_EVALUATION_RESULT_SORT)}
          aria-label={t("sortBy")}
        >
          {EVALUATION_RESULT_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(sortLabelKeys[option])}
            </option>
          ))}
        </select>
        {(query || bandFilter || sort !== DEFAULT_EVALUATION_RESULT_SORT) && (
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setQuery("");
              setBandFilter("");
              setSort(DEFAULT_EVALUATION_RESULT_SORT);
            }}
          >
            {t("resetFilters")}
          </button>
        )}
        <ExportMenu
          columns={EVALUATION_RESULT_EXPORT_COLUMNS.map((key) => ({ key, label: exportColumnLabels[key] }))}
          filenameBase="evaluation-results"
          buildHref={(format, columns) => {
            const params = new URLSearchParams(exportParams);
            params.set("format", format);
            params.set("columns", columns.join(","));
            return `/api/evaluation-results/export?${params}`;
          }}
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
      </div>

      {/* On paper the controls above are gone, so the sheet has to say what it
          is: the cycle, when it was printed, and which filter produced these rows. */}
      <div className="print-only">
        <strong style={{ fontSize: 13.5 }}>{t("title")}</strong>
        <div style={{ fontSize: 11.5 }}>
          {cycleName} — {t("printedOn", { date: printedOn })}
          {" — "}
          {t("printedCount", { shown: visible.length, total: results.length })}
          {bandFilter ? ` — ${RATING_BANDS.find((b) => b.id === bandFilter)?.labelAr ?? bandFilter}` : ""}
          {query.trim() ? ` — "${query.trim()}"` : ""}
        </div>
      </div>

      <div className="sru-card">
        {visible.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{results.length === 0 ? t("empty") : t("noMatches")}</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployeeName")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnScore")}</th>
                  <th>{t("columnBand")}</th>
                  <th>{t("columnMethodBreakdown")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <RowLink key={row.evaluationId} href={`/evaluations/${row.evaluationId}`}>
                    <td>
                      {row.employeeNumber ?? "—"}
                      {row.employeeName ? ` — ${row.employeeName}` : ""}
                    </td>
                    <td>{row.orgUnitName ?? "—"}</td>
                    <td>{row.score != null ? `${row.score.toFixed(1)}%` : "—"}</td>
                    <td>
                      {row.bandLabel ? <span className={`sru-rating-chip is-${row.bandId}`}>{row.bandLabel}</span> : "—"}
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--sru-muted)" }}>
                      {(Object.keys(methodLabels) as EvaluationMethod[])
                        .map((method) => {
                          const value = row.methodScores[method];
                          return `${methodLabels[method]}: ${value != null ? `${value.toFixed(0)}%` : "—"}`;
                        })
                        .join(" · ")}
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
