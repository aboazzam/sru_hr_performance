"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { useTranslations } from "next-intl";
import {
  RecruitmentRequestRow,
  type RecruitmentRequestRowData,
} from "@/components/RecruitmentRequestRow";
import {
  DEFAULT_REQUEST_SORT,
  filterRequests,
  isRequestSortOption,
  sortRequests,
  REQUEST_SORT_OPTIONS,
  type RequestSortOption,
} from "@/lib/recruitmentRequestTable";
import {
  requestStatusLabels,
  requestStatuses,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import { type CompetencyDraft, type CompetencyOption } from "@/components/CompetencyLevelPicker";

export interface RecruitmentRequestView {
  request: RecruitmentRequestRowData;
  jobTitle: string;
  orgUnit: string;
  createdAt: string;
}

const sortLabelKeys: Record<RequestSortOption, string> = {
  newest: "sortNewest",
  oldest: "sortOldest",
  jobTitle: "sortJobTitle",
  orgUnit: "sortOrgUnit",
  headcountDesc: "sortHeadcountDesc",
  headcountAsc: "sortHeadcountAsc",
  status: "sortStatus",
};

/**
 * The طلبات الاحتياج table: live search, a status filter and a sort picker
 * over the already-fetched rows.
 *
 * In-memory, like every other list in this app (vacancies, job titles, admin
 * users) — `recruitment_requests`' org-scoped RLS has already decided which
 * rows exist for this caller, so filtering here narrows what they are looking
 * at and never widens it. The rules themselves live in
 * `lib/recruitmentRequestTable.ts` so they can be unit-tested; this component
 * only wires the inputs to them and keeps rendering one row per result via
 * the existing `RecruitmentRequestRow`.
 */
export function RecruitmentRequestsTable({
  rows,
  permissions,
  competencies,
  competenciesByRequest,
  canEdit,
  columnCount,
  printedOn,
}: {
  rows: RecruitmentRequestView[];
  permissions: RecruitmentPermissions;
  /** The competency catalogue and each request's current links, for the inline editor. */
  competencies: CompetencyOption[];
  competenciesByRequest: Record<string, CompetencyDraft[]>;
  canEdit: boolean;
  columnCount: number;
  /** Formatted server-side (display timezone) — a Date created here would
   *  differ between the server and client renders. */
  printedOn: string;
}) {
  const t = useTranslations("RecruitmentRequestsPage");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<RequestSortOption>(DEFAULT_REQUEST_SORT);

  // The sortable shape the helpers work on, paired back to its view row.
  const sortable = useMemo(
    () =>
      rows.map((row) => ({
        jobTitle: row.jobTitle,
        orgUnit: row.orgUnit,
        headcount: row.request.headcount,
        status: row.request.status,
        qualifications: row.request.qualifications,
        createdAt: row.createdAt,
        view: row,
      })),
    [rows]
  );

  const visible = useMemo(
    () => sortRequests(filterRequests(sortable, { query, status: statusFilter }), sort),
    [sortable, query, statusFilter, sort]
  );

  const filtering = query.trim() !== "" || statusFilter !== "";

  // The export re-fetches through the caller's own RLS on the server; these
  // params only tell it to narrow the same way the screen currently is, so
  // the file matches what the reader is looking at.
  const exportParams = new URLSearchParams();
  if (query.trim() !== "") exportParams.set("q", query.trim());
  if (statusFilter !== "") exportParams.set("status", statusFilter);
  if (sort !== DEFAULT_REQUEST_SORT) exportParams.set("sort", sort);
  const exportHref = `/api/recruitment/requests/export${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        className="no-print"
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          style={{ minWidth: 240, flex: "1 1 240px" }}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label={t("filterByStatus")}
        >
          <option value="">{t("allStatuses")}</option>
          {requestStatuses.map((status) => (
            <option key={status} value={status}>
              {requestStatusLabels[status]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) =>
            setSort(isRequestSortOption(event.target.value) ? event.target.value : DEFAULT_REQUEST_SORT)
          }
          aria-label={t("sortBy")}
        >
          {REQUEST_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(sortLabelKeys[option])}
            </option>
          ))}
        </select>
        {(filtering || sort !== DEFAULT_REQUEST_SORT) && (
          <button
            type="button"
            className="sru-btn"
            onClick={() => {
              setQuery("");
              setStatusFilter("");
              setSort(DEFAULT_REQUEST_SORT);
            }}
          >
            {t("resetFilters")}
          </button>
        )}
        <a
          href={exportHref}
          className="sru-btn"
          // A plain download link, not a fetch: the browser handles the file
          // and the request carries the session cookie like any other.
          download
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <FileSpreadsheet size={15} aria-hidden />
          {t("exportExcel")}
        </a>
        <PrintButton />
        <span style={{ color: "var(--sru-muted)", fontSize: 12.5 }}>
          {t("resultCount", { shown: visible.length, total: rows.length })}
        </span>
      </div>

      {/* On paper the reader loses the controls above, so the sheet has to
          say what it is: the screen's title, when it was printed, and which
          filter produced these rows. */}
      <div className="print-only" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>{t("title")}</strong>
        <div style={{ fontSize: 12 }}>
          {t("printedOn", { date: printedOn })}
          {" — "}
          {t("resultCount", { shown: visible.length, total: rows.length })}
          {statusFilter ? ` — ${t("columnStatus")}: ${requestStatusLabels[statusFilter as keyof typeof requestStatusLabels] ?? statusFilter}` : ""}
          {query.trim() ? ` — "${query.trim()}"` : ""}
        </div>
      </div>

      {visible.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noMatches")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnHeadcount")}</th>
                  <th>{t("columnReason")}</th>
                  <th>{t("columnContract")}</th>
                  <th>{t("columnGender")}</th>
                  <th>{t("columnQuarter")}</th>
                  <th>{t("columnCost")}</th>
                  <th>{t("columnStatus")}</th>
                  <th className="sru-col-actions">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ view }) => (
                  <RecruitmentRequestRow
                    key={view.request.id}
                    request={view.request}
                    jobTitle={view.jobTitle}
                    orgUnit={view.orgUnit}
                    permissions={permissions}
                    competencies={competencies}
                    selectedCompetencies={competenciesByRequest[view.request.id] ?? []}
                    canEdit={canEdit}
                    columnCount={columnCount}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
