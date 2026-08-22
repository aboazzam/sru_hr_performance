"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Trash2, Megaphone, MegaphoneOff } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { VACANCY_EXPORT_COLUMNS } from "@/lib/vacancyExportColumns";
import {
  DEFAULT_VACANCY_SORT,
  filterVacancies,
  isVacancySortOption,
  sortVacancies,
  VACANCY_SORT_OPTIONS,
  type VacancySortOption,
} from "@/lib/vacancyTable";
import {
  countVacancyStatuses,
  vacancyStatuses,
  vacancyStatusLabel,
  vacancyStatusLabels,
} from "@/lib/vacancyStatus";
import {
  updateVacancyStatus,
  deleteVacancy,
  setVacancyAnnouncement,
  type VacancyActionState,
} from "@/app/[locale]/(app)/vacancies/actions";

export interface VacancyRowView {
  id: string;
  jobTitleName: string | null;
  gradeLevel: number | null;
  orgUnitName: string | null;
  status: string;
  requirementsAr: string | null;
  /** "خطة التوظيف {year}" when this posting came from a plan item, else null. */
  planYear: number | null;
  /** Advertised in the "الوظائف المعلن عنها" tab (announced_at IS NOT NULL). */
  announced: boolean;
  /** أي بوابة يظهر عليها الإعلان: داخلية | خارجية | كلتاهما. */
  postingScope: string;
  /** Used only for ordering (newest/oldest, and inside "advertised first"). */
  createdAt: string;
}

const sortLabelKeys: Record<VacancySortOption, string> = {
  newest: "sortNewest",
  oldest: "sortOldest",
  jobTitle: "sortJobTitle",
  orgUnit: "sortOrgUnit",
  gradeDesc: "sortGradeDesc",
  gradeAsc: "sortGradeAsc",
  status: "sortStatus",
  announcedFirst: "sortAnnouncedFirst",
};

const errorKeys: Record<string, string> = {
  invalid_input: "actionErrorInvalid",
  unauthenticated: "actionErrorUnauthenticated",
  forbidden: "actionErrorForbidden",
  unknown: "actionErrorUnknown",
};

/**
 * The vacancies list: summary counts, live search/status filter, and (for
 * callers who clear `vacancies_update`'s own RLS) inline status changes and
 * soft-delete. Filtering is in-memory over the already-fetched rows, the
 * same convention as JobTitlesTable/SalaryScaleTable — this list is small
 * and it keeps the whole interaction zero-round-trip.
 */
export function VacanciesTable({
  vacancies,
  canManage,
  printedOn,
}: {
  vacancies: VacancyRowView[];
  canManage: boolean;
  /** Formatted server-side (display timezone) — a Date created in this client
   *  component would differ between the server and client renders. */
  printedOn: string;
}) {
  const t = useTranslations("VacanciesPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<VacancySortOption>(DEFAULT_VACANCY_SORT);
  const [actionState, setActionState] = useState<VacancyActionState | null>(null);
  /** اختيار بوابة النشر لكل صف قبل الإعلان (داخلي افتراضًا). */
  const [scopeChoice, setScopeChoice] = useState<Record<string, string>>({});

  const counts = useMemo(() => countVacancyStatuses(vacancies.map((v) => v.status)), [vacancies]);

  const filtered = useMemo(
    () => filterVacancies(vacancies, { query, status: statusFilter }),
    [vacancies, query, statusFilter]
  );

  const visible = useMemo(() => sortVacancies(filtered, sort), [filtered, sort]);

  function run(fn: () => Promise<VacancyActionState>) {
    setActionState(null);
    startTransition(async () => {
      const result = await fn();
      setActionState(result);
      if (result.status === "success") router.refresh();
    });
  }

  // The export re-fetches on the server through the caller's own RLS; these
  // params only tell it to narrow the same way the screen currently is.
  const exportParams = new URLSearchParams();
  if (query.trim() !== "") exportParams.set("q", query.trim());
  if (statusFilter !== "") exportParams.set("status", statusFilter);
  if (sort !== DEFAULT_VACANCY_SORT) exportParams.set("sort", sort);
  const exportColumnLabels: Record<string, string> = {
    jobTitle: t("columnJobTitle"),
    grade: t("gradeHeader"),
    orgUnit: t("columnOrgUnit"),
    status: t("columnStatus"),
    announced: t("announcedHeader"),
    scope: t("scopeSelectLabel"),
    plan: t("planHeader"),
    requirements: t("columnRequirements"),
    createdAt: t("createdAtHeader"),
  };

  const summary: Array<{ key: string; label: string; value: number }> = [
    { key: "total", label: t("summaryTotal"), value: counts.total },
    { key: "open", label: vacancyStatusLabels.open, value: counts.open },
    { key: "closed", label: vacancyStatusLabels.closed, value: counts.closed },
    { key: "filled", label: vacancyStatusLabels.filled, value: counts.filled },
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

      <div
        className="no-print"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          style={{ minWidth: 260, flex: "1 1 260px" }}
          aria-label={t("searchPlaceholder")}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t("filterByStatus")}
        >
          <option value="">{t("allStatuses")}</option>
          {vacancyStatuses.map((s) => (
            <option key={s} value={s}>
              {vacancyStatusLabels[s]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) =>
            setSort(isVacancySortOption(e.target.value) ? e.target.value : DEFAULT_VACANCY_SORT)
          }
          aria-label={t("sortBy")}
        >
          {VACANCY_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(sortLabelKeys[option])}
            </option>
          ))}
        </select>
        {(query || statusFilter || sort !== DEFAULT_VACANCY_SORT) && (
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setQuery("");
              setStatusFilter("");
              setSort(DEFAULT_VACANCY_SORT);
            }}
          >
            {t("resetFilters")}
          </button>
        )}
        {/* One "تصدير" control (PDF / Excel / CSV + a column picker),
            the same one the employees screen uses. */}
        <ExportMenu
          columns={VACANCY_EXPORT_COLUMNS.map((key) => ({ key, label: exportColumnLabels[key] }))}
          filenameBase="vacancies"
          buildHref={(format, columns) => {
            const params = new URLSearchParams(exportParams);
            params.set("format", format);
            params.set("columns", columns.join(","));
            return `/api/vacancies/export?${params}`;
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
        {actionState?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[actionState.message] ?? "actionErrorUnknown")}
          </span>
        )}
      </div>

      {/* On paper the controls above are gone, so the sheet has to say what it
          is: the screen's title, when it was printed, and which filter produced
          these rows. */}
      <div className="print-only">
        <strong style={{ fontSize: 15 }}>{t("title")}</strong>
        <div style={{ fontSize: 12 }}>
          {t("printedOn", { date: printedOn })}
          {" — "}
          {t("printedCount", { shown: visible.length, total: vacancies.length })}
          {statusFilter ? ` — ${t("columnStatus")}: ${vacancyStatusLabel(statusFilter)}` : ""}
          {query.trim() ? ` — "${query.trim()}"` : ""}
        </div>
      </div>

      <div className="sru-card">
        {visible.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>
            {vacancies.length === 0 ? t("empty") : t("noMatches")}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnRequirements")}</th>
                  {canManage && <th className="sru-col-actions">{t("columnActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      {vacancy.jobTitleName ?? "—"}
                      {vacancy.gradeLevel != null && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: vacancy.gradeLevel })}
                        </span>
                      )}
                      {vacancy.announced && (
                        <span
                          className="pill"
                          style={{ marginInlineStart: 8, fontSize: 11 }}
                          title={t("announcedBadgeTitle")}
                        >
                          {t("announcedBadge")}
                        </span>
                      )}
                      {vacancy.planYear != null && (
                        <div style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 2 }}>
                          {t("fromPlan", { year: vacancy.planYear })}
                        </div>
                      )}
                    </td>
                    <td>{vacancy.orgUnitName ?? "—"}</td>
                    <td>
                      {canManage ? (
                        <select
                          value={vacancyStatuses.includes(vacancy.status as (typeof vacancyStatuses)[number])
                            ? vacancy.status
                            : ""}
                          disabled={pending}
                          onChange={(e) => run(() => updateVacancyStatus(vacancy.id, e.target.value))}
                          aria-label={t("columnStatus")}
                        >
                          {/* An imported/unknown status keeps its own option so
                              selecting it back is possible and the cell never
                              silently shows a different value than the row has. */}
                          {!vacancyStatuses.includes(vacancy.status as (typeof vacancyStatuses)[number]) && (
                            <option value="">{vacancy.status}</option>
                          )}
                          {vacancyStatuses.map((s) => (
                            <option key={s} value={s}>
                              {vacancyStatusLabels[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="pill">{vacancyStatusLabel(vacancy.status)}</span>
                      )}
                    </td>
                    <td>{vacancy.requirementsAr ?? "—"}</td>
                    {canManage && (
                      <td className="sru-col-actions">
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {/* اختيار البوابة قبل الإعلان — يظهر فقط قبله، لأن
                            سحب الإعلان لا يحتاج نطاقًا. الافتراضي "داخلي"
                            مطابقًا لافتراض قاعدة البيانات، فلا يُنشر شيء
                            خارجيًا بضغطة واحدة غير مقصودة. */}
                        {!vacancy.announced && (
                          <select
                            aria-label={t("scopeSelectLabel")}
                            style={{ fontSize: 12, padding: "2px 4px" }}
                            value={scopeChoice[vacancy.id] ?? "internal"}
                            disabled={pending}
                            onChange={(event) =>
                              setScopeChoice((current) => ({
                                ...current,
                                [vacancy.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="internal">{t("scopeInternal")}</option>
                            <option value="external">{t("scopeExternal")}</option>
                            <option value="both">{t("scopeBoth")}</option>
                          </select>
                        )}
                        {/* Announce / withdraw — the single icon toggles, so a
                            row can never show both actions at once. */}
                        <button
                          type="button"
                          className="sru-icon-action"
                          title={vacancy.announced ? t("unannounceButton") : t("announceButton")}
                          aria-label={vacancy.announced ? t("unannounceButton") : t("announceButton")}
                          disabled={pending}
                          onClick={() => {
                            if (vacancy.announced && !window.confirm(t("unannounceConfirm"))) return;
                            run(() =>
                              setVacancyAnnouncement(
                                vacancy.id,
                                !vacancy.announced,
                                (scopeChoice[vacancy.id] ?? "internal") as
                                  | "internal"
                                  | "external"
                                  | "both"
                              )
                            );
                          }}
                        >
                          {vacancy.announced ? (
                            <MegaphoneOff size={15} aria-hidden />
                          ) : (
                            <Megaphone size={15} aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className="sru-icon-action"
                          title={t("deleteButton")}
                          aria-label={t("deleteButton")}
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm(t("deleteConfirm"))) return;
                            run(() => deleteVacancy(vacancy.id));
                          }}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                        </div>
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
