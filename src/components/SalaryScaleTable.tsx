"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

interface SalaryScaleRow {
  id: string;
  step_a: number;
  step_b: number;
  step_c: number;
  step_d: number;
  step_e: number;
  step_f: number;
  step_g: number;
  step_h: number | null;
  step_i: number | null;
  annual_increase_cap: number | null;
  effective_date: string;
  job_titles: { name_ar: string; grade_level: number } | null;
}

/**
 * Adds live, hamza-insensitive search over this ~336-row table (same
 * established pattern as JobTitlesTable/CareerPathTracksExplorer) — this
 * page never had ANY search before, submit-based or otherwise.
 */
export function SalaryScaleTable({
  rows,
  locale,
}: {
  rows: SalaryScaleRow[];
  locale: string;
}) {
  const t = useTranslations("SalaryScalePage");
  const [query, setQuery] = useState("");

  const formatNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter((r) => (r.job_titles ? includesIgnoringHamza(r.job_titles.name_ar, q) : false));
  }, [rows, query]);

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 20 }} className="no-print">
        <Search
          size={15}
          style={{
            position: "absolute",
            insetInlineStart: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--sru-muted)",
          }}
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          style={{
            width: "100%",
            padding: "8px 34px 8px 10px",
            borderRadius: "var(--sru-radius)",
            border: "1px solid var(--sru-border)",
            background: "var(--background)",
            fontSize: 13,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noResults")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                  <th>H</th>
                  <th>I</th>
                  <th>{t("columnAnnualCap")}</th>
                  <th>{t("columnEffectiveDate")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.job_titles?.name_ar ?? "—"}
                      {row.job_titles && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: row.job_titles.grade_level })}
                        </span>
                      )}
                    </td>
                    <td>{formatNumber(row.step_a)}</td>
                    <td>{formatNumber(row.step_b)}</td>
                    <td>{formatNumber(row.step_c)}</td>
                    <td>{formatNumber(row.step_d)}</td>
                    <td>{formatNumber(row.step_e)}</td>
                    <td>{formatNumber(row.step_f)}</td>
                    <td>{formatNumber(row.step_g)}</td>
                    <td>{row.step_h != null ? formatNumber(row.step_h) : "—"}</td>
                    <td>{row.step_i != null ? formatNumber(row.step_i) : "—"}</td>
                    <td>{row.annual_increase_cap != null ? formatNumber(row.annual_increase_cap) : "—"}</td>
                    <td>{row.effective_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
