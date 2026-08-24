"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { RowLink } from "@/components/RowLink";

interface JobTitleRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  grade_level: number;
  description_ar: string | null;
  career_content_status: "draft" | "approved";
  job_families: { name_ar: string } | null;
  job_title_competencies: Array<{ id: string }>;
}

/**
 * Replaces the previous `<form method="get">` submit-on-enter search (a full
 * page reload per query) with live, on-every-keystroke filtering — the
 * project owner explicitly asked for results to "start appearing as soon as
 * the letters are entered," not after a submit. All ~360 job titles are
 * already fetched server-side (this page never paginated), so filtering
 * client-side over the already-loaded rows is cheap and instant; no new
 * query per keystroke, unlike the old GET-form approach.
 */
export function JobTitlesTable({ rows }: { rows: JobTitleRow[] }) {
  const t = useTranslations("CareerPathJobTitlesPage");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        includesIgnoringHamza(r.name_ar, q) ||
        // Searchable in English too, now that the Latin name is on screen:
        // typing it and matching nothing would read as a broken search.
        (r.name_en ? r.name_en.toLowerCase().includes(q.toLowerCase()) : false) ||
        (r.job_families ? includesIgnoringHamza(r.job_families.name_ar, q) : false)
    );
  }, [rows, query]);

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 20 }}>
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
            fontSize: 12,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnName")}</th>
                  <th>{t("columnFamily")}</th>
                  <th>{t("columnDescription")}</th>
                  <th>{t("columnCompetencies")}</th>
                  <th>{t("columnStatus")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <RowLink key={r.id} href={`/career-path/job-titles/${r.id}`}>
                    <td>
                      <Link href={`/career-path/job-titles/${r.id}`} className="sru-row-link-title">
                        {r.name_ar}
                      </Link>
                      <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                        {t("gradeLabel", { grade: r.grade_level })}
                      </span>
                      {r.name_en && <span className="sru-name-en">{r.name_en}</span>}
                    </td>
                    <td>{r.job_families?.name_ar ?? "—"}</td>
                    <td>{r.description_ar ? t("hasDescription") : t("noDescription")}</td>
                    <td>{t("competencyCount", { count: r.job_title_competencies.length })}</td>
                    <td>{r.career_content_status === "approved" ? t("statusApproved") : t("statusDraft")}</td>
                    <td>
                      <Link href={`/career-path/job-titles/${r.id}`} className="sru-btn">
                        {t("manage")}
                      </Link>
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
