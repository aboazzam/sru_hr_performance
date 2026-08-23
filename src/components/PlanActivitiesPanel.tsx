"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CalendarRange, List } from "lucide-react";
import { groupByYear, monthsBetween, coversWeek, WEEKS_PER_MONTH } from "@/lib/initiativeTimeline";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import { formatDateDmy } from "@/lib/dateParts";

export interface PlanActivityRow {
  id: string;
  titleAr: string;
  responsible: string | null;
  startDate: string | null;
  endDate: string | null;
  initiativeId: string;
  initiativeTitle: string;
  /** Every unit that carries this activity's initiative — the owner and any
   *  unit the initiative is assigned to. An activity can belong to several. */
  orgUnitIds: string[];
  orgUnitNames: string[];
}

export interface ActivityFilterOption {
  id: string;
  label: string;
}

/**
 * جميع الأنشطة — every activity under the plan's initiatives on one screen,
 * filterable by unit, by initiative, or laid out on the timeline
 * (2026-08-23: "تاب آخر لجميع الأنشطة بحيث يستطيع المستخدم فلترتها حسب
 * الإدارة أو حسب المبادرة أو على الجدول الزمني").
 *
 * The timeline reuses the initiative card's own month/week split rather than
 * inventing a second one, so an activity sits in exactly the same place here
 * as on the card it came from.
 *
 * An activity with no dates is NOT dropped from the timeline view — it is
 * listed underneath it. Silently hiding work because nobody typed its dates
 * would misreport the plan.
 */
export function PlanActivitiesPanel({
  activities,
  orgUnits,
  initiatives,
  locale,
}: {
  activities: PlanActivityRow[];
  orgUnits: ActivityFilterOption[];
  initiatives: ActivityFilterOption[];
  locale: string;
}) {
  const t = useTranslations("ExecutivePlanDetailPage");
  const [view, setView] = useState<"list" | "timeline">("list");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    return activities.filter((a) => {
      if (orgUnitId && !a.orgUnitIds.includes(orgUnitId)) return false;
      if (initiativeId && a.initiativeId !== initiativeId) return false;
      if (q && !includesIgnoringHamza(a.titleAr, q) && !includesIgnoringHamza(a.initiativeTitle, q)) return false;
      return true;
    });
  }, [activities, orgUnitId, initiativeId, query]);

  const dated = filtered.filter((a) => a.startDate || a.endDate);
  const undated = filtered.filter((a) => !a.startDate && !a.endDate);

  // One span covering everything shown, so every activity lands on the same
  // grid and two rows can be compared by eye.
  const months = useMemo(() => {
    const starts = dated.map((a) => a.startDate ?? a.endDate!).filter(Boolean);
    const ends = dated.map((a) => a.endDate ?? a.startDate!).filter(Boolean);
    if (starts.length === 0 || ends.length === 0) return [];
    return monthsBetween(starts.slice().sort()[0], ends.slice().sort()[ends.length - 1]);
  }, [dated]);
  const years = useMemo(() => groupByYear(months), [months]);

  const hasFilter = orgUnitId !== "" || initiativeId !== "" || query.trim() !== "";

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>{t("activitiesIntro")}</p>

      <div className="sru-filterbar no-print">
        <label>
          <span>{t("activitiesFilterUnit")}</span>
          <select value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
            <option value="">{t("activitiesFilterAll")}</option>
            {orgUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("activitiesFilterInitiative")}</span>
          <select value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            <option value="">{t("activitiesFilterAll")}</option>
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("activitiesSearch")}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("activitiesSearchPlaceholder")} />
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={view === "list" ? "sru-btn sru-btn-primary" : "sru-btn"}
            onClick={() => setView("list")}
          >
            <List size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
            {t("activitiesViewList")}
          </button>
          <button
            type="button"
            className={view === "timeline" ? "sru-btn sru-btn-primary" : "sru-btn"}
            onClick={() => setView("timeline")}
          >
            <CalendarRange size={14} aria-hidden style={{ marginInlineEnd: 6 }} />
            {t("activitiesViewTimeline")}
          </button>
        </div>
        {hasFilter && (
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setOrgUnitId("");
              setInitiativeId("");
              setQuery("");
            }}
          >
            {t("activitiesReset")}
          </button>
        )}
        <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>
          {t("activitiesCount", { shown: filtered.length, total: activities.length })}
        </span>
      </div>

      {activities.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 14 }}>{t("activitiesNone")}</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginTop: 14 }}>{t("activitiesNoMatches")}</p>
      ) : view === "list" ? (
        <div className="sru-card" style={{ marginTop: 14 }}>
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("activitiesColumnTitle")}</th>
                  <th>{t("activitiesColumnInitiative")}</th>
                  <th>{t("activitiesColumnUnit")}</th>
                  <th>{t("activitiesColumnResponsible")}</th>
                  <th>{t("activitiesColumnPeriod")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>{a.titleAr}</td>
                    <td>
                      <Link href={`/initiatives/${a.initiativeId}`} className="sru-row-link-title">
                        {a.initiativeTitle}
                      </Link>
                    </td>
                    <td>{a.orgUnitNames.length > 0 ? a.orgUnitNames.join("، ") : "—"}</td>
                    <td>{a.responsible ?? "—"}</td>
                    <td>
                      {a.startDate || a.endDate
                        ? `${a.startDate ? formatDateDmy(a.startDate, locale) : "—"} → ${
                            a.endDate ? formatDateDmy(a.endDate, locale) : "—"
                          }`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {months.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("activitiesNoDates")}</p>
          ) : (
            <div className="sru-card">
              <div className="table-scroll">
                <table className="admin-matrix sru-activity-timeline">
                  <thead>
                    <tr>
                      <th rowSpan={2} style={{ minWidth: 200 }}>
                        {t("activitiesColumnTitle")}
                      </th>
                      {years.map((y) => (
                        <th key={y.year} colSpan={y.months.length * WEEKS_PER_MONTH} className="sru-en">
                          {y.year}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {months.map((m) => (
                        <th key={m.key} colSpan={WEEKS_PER_MONTH} className="sru-week-cell is-month-start" style={{ textAlign: "center" }}>
                          M{m.month}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dated.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{a.titleAr}</span>
                          <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 11.5 }}>{a.initiativeTitle}</span>
                        </td>
                        {months.map((m) =>
                          Array.from({ length: WEEKS_PER_MONTH }, (_, i) => i + 1).map((week) => {
                            const on = coversWeek({ startDate: a.startDate, endDate: a.endDate }, m, week);
                            return (
                              <td
                                key={m.key + "-" + week}
                                className={week === WEEKS_PER_MONTH ? "sru-week-cell is-month-end" : "sru-week-cell"}
                              >
                                {on && <span className="sru-week-fill" aria-hidden />}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {undated.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                {t("activitiesUndatedHeading", { count: undated.length })}
              </h3>
              <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 8 }}>{t("activitiesUndatedNote")}</p>
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 1.9 }}>
                {undated.map((a) => (
                  <li key={a.id}>
                    {a.titleAr} — <span style={{ color: "var(--sru-muted)" }}>{a.initiativeTitle}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
