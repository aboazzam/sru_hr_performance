"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { filterPromotions } from "@/lib/promotionTable";
import { PromotionReviewActions } from "@/components/PromotionReviewActions";
import { ExportMenu } from "@/components/ExportMenu";
import { PROMOTION_EXPORT_COLUMNS } from "@/lib/promotionExportColumns";
import {
  countPromotionStatuses,
  promotionStatuses,
  promotionStatusLabel,
  promotionStatusLabels,
  type CareerPathMatch,
} from "@/lib/promotionStatus";

export interface PromotionRowView {
  id: string;
  employeeNumber: string | null;
  employeeName: string | null;
  cycleName: string | null;
  fromTitleName: string | null;
  fromGrade: number | null;
  toTitleName: string | null;
  toGrade: number | null;
  status: string;
  careerPathMatch: CareerPathMatch;
}

/**
 * The promotions list: summary counts, live hamza-insensitive search, a
 * status filter, Arabic status labels, and — the substantive addition — a
 * career-ladder badge per row. `career_path` holds 155+ real edges built
 * from the university's own Career Path workbook, so a proposal can be shown
 * as on- or off-ladder instead of the reviewer having to know by heart.
 * The badge is INFORMATION, not a gate: an off-ladder promotion is a real
 * managerial decision, so nothing here blocks it.
 */
export function PromotionsTable({
  promotions,
  canReview,
  printedOn,
}: {
  promotions: PromotionRowView[];
  canReview: boolean;
  /** Formatted server-side (display timezone) — a Date created in this client
   *  component would differ between the server and client renders. */
  printedOn: string;
}) {
  const t = useTranslations("PromotionsPage");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const counts = useMemo(() => countPromotionStatuses(promotions.map((p) => p.status)), [promotions]);

  const filtered = useMemo(
    () => filterPromotions(promotions, { query, status: statusFilter }),
    [promotions, query, statusFilter]
  );

  // The export re-fetches on the server through the caller's own RLS; these
  // params only tell it to narrow the same way the screen currently is.
  const exportParams = new URLSearchParams();
  if (query.trim() !== "") exportParams.set("q", query.trim());
  if (statusFilter !== "") exportParams.set("status", statusFilter);
  const exportColumnLabels: Record<string, string> = {
    employeeNumber: t("employeeNumberHeader"),
    employeeName: t("employeeNameHeader"),
    cycle: t("columnCycle"),
    fromTitle: t("columnFrom"),
    fromGrade: t("fromGradeHeader"),
    toTitle: t("columnTo"),
    toGrade: t("toGradeHeader"),
    status: t("columnStatus"),
    careerPath: t("careerPathHeader"),
    createdAt: t("createdAtHeader"),
  };

  const summary = [
    { key: "total", label: t("summaryTotal"), value: counts.total },
    { key: "pending", label: promotionStatusLabels.pending, value: counts.pending },
    { key: "approved", label: promotionStatusLabels.approved, value: counts.approved },
    { key: "rejected", label: promotionStatusLabels.rejected, value: counts.rejected },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sru-card">
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {summary.map((s) => (
            <div key={s.key}>
              <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{s.label}</div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
          {counts.other > 0 && (
            <div>
              <div style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("summaryOther")}</div>
              <div style={{ fontSize: 19, fontWeight: 700 }}>{counts.other}</div>
            </div>
          )}
        </div>
      </div>

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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t("filterByStatus")}
        >
          <option value="">{t("allStatuses")}</option>
          {promotionStatuses.map((s) => (
            <option key={s} value={s}>
              {promotionStatusLabels[s]}
            </option>
          ))}
        </select>
        {(query || statusFilter) && (
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setQuery("");
              setStatusFilter("");
            }}
          >
            {t("resetFilters")}
          </button>
        )}
        {/* One "تصدير" control (PDF / Excel / CSV + a column picker),
            the same one the employees screen uses. */}
        <ExportMenu
          columns={PROMOTION_EXPORT_COLUMNS.map((key) => ({ key, label: exportColumnLabels[key] }))}
          filenameBase="promotions"
          buildHref={(format, columns) => {
            const params = new URLSearchParams(exportParams);
            params.set("format", format);
            params.set("columns", columns.join(","));
            return `/api/promotions/export?${params}`;
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
          is: the screen's title, when it was printed, and which filter produced
          these rows. */}
      <div className="print-only">
        <strong style={{ fontSize: 13.5 }}>{t("title")}</strong>
        <div style={{ fontSize: 11.5 }}>
          {t("printedOn", { date: printedOn })}
          {" — "}
          {t("printedCount", { shown: filtered.length, total: promotions.length })}
          {statusFilter ? ` — ${t("columnStatus")}: ${promotionStatusLabel(statusFilter)}` : ""}
          {query.trim() ? ` — "${query.trim()}"` : ""}
        </div>
      </div>

      <div className="sru-card">
        {filtered.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>
            {promotions.length === 0 ? t("empty") : t("noMatches")}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnEmployee")}</th>
                  <th>{t("columnCycle")}</th>
                  <th>{t("columnFrom")}</th>
                  <th>{t("columnTo")}</th>
                  <th>{t("columnStatus")}</th>
                  {canReview && <th className="sru-col-actions">{t("columnActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((promotion) => (
                  <tr key={promotion.id}>
                    <td>
                      {promotion.employeeNumber ?? "—"}
                      {promotion.employeeName ? ` — ${promotion.employeeName}` : ""}
                    </td>
                    <td>{promotion.cycleName ?? "—"}</td>
                    <td>
                      {promotion.fromTitleName ?? "—"}
                      {promotion.fromGrade != null && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 6 }}>
                          {t("gradeLabel", { grade: promotion.fromGrade })}
                        </span>
                      )}
                    </td>
                    <td>
                      {promotion.toTitleName ?? "—"}
                      {promotion.toGrade != null && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 6 }}>
                          {t("gradeLabel", { grade: promotion.toGrade })}
                        </span>
                      )}
                      {promotion.careerPathMatch !== "unknown" && (
                        <div
                          style={{
                            fontSize: 11.5,
                            marginTop: 3,
                            color:
                              promotion.careerPathMatch === "on_path"
                                ? "var(--sru-success, #15803d)"
                                : "var(--sru-muted)",
                          }}
                        >
                          {promotion.careerPathMatch === "on_path" ? t("onCareerPath") : t("offCareerPath")}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="pill">{promotionStatusLabel(promotion.status)}</span>
                    </td>
                    {canReview && (
                      <td className="sru-col-actions">
                        {promotion.status === "pending" && <PromotionReviewActions promotionId={promotion.id} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
