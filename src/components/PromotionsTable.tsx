"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { PromotionReviewActions } from "@/components/PromotionReviewActions";
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
}: {
  promotions: PromotionRowView[];
  canReview: boolean;
}) {
  const t = useTranslations("PromotionsPage");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const counts = useMemo(() => countPromotionStatuses(promotions.map((p) => p.status)), [promotions]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return promotions.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        includesIgnoringHamza(p.employeeName ?? "", q) ||
        (p.employeeNumber ?? "").includes(q) ||
        includesIgnoringHamza(p.fromTitleName ?? "", q) ||
        includesIgnoringHamza(p.toTitleName ?? "", q)
      );
    });
  }, [promotions, query, statusFilter]);

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
              <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
          {counts.other > 0 && (
            <div>
              <div style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("summaryOther")}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{counts.other}</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
      </div>

      <div className="sru-card">
        {filtered.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>
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
                  {canReview && <th>{t("columnActions")}</th>}
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
                            fontSize: 12,
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
                      <td>
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
