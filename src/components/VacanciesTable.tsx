"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Trash2 } from "lucide-react";
import { includesIgnoringHamza } from "@/lib/arabicSearch";
import {
  countVacancyStatuses,
  vacancyStatuses,
  vacancyStatusLabel,
  vacancyStatusLabels,
} from "@/lib/vacancyStatus";
import {
  updateVacancyStatus,
  deleteVacancy,
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
}

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
}: {
  vacancies: VacancyRowView[];
  canManage: boolean;
}) {
  const t = useTranslations("VacanciesPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionState, setActionState] = useState<VacancyActionState | null>(null);

  const counts = useMemo(() => countVacancyStatuses(vacancies.map((v) => v.status)), [vacancies]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return vacancies.filter((v) => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        includesIgnoringHamza(v.jobTitleName ?? "", q) ||
        includesIgnoringHamza(v.orgUnitName ?? "", q) ||
        includesIgnoringHamza(v.requirementsAr ?? "", q)
      );
    });
  }, [vacancies, query, statusFilter]);

  function run(fn: () => Promise<VacancyActionState>) {
    setActionState(null);
    startTransition(async () => {
      const result = await fn();
      setActionState(result);
      if (result.status === "success") router.refresh();
    });
  }

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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
        {actionState?.status === "error" && (
          <span role="alert" className="text-sm text-red-600">
            {t(errorKeys[actionState.message] ?? "actionErrorUnknown")}
          </span>
        )}
      </div>

      <div className="sru-card">
        {filtered.length === 0 ? (
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
                  {canManage && <th>{t("columnActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      {vacancy.jobTitleName ?? "—"}
                      {vacancy.gradeLevel != null && (
                        <span className="sru-chip sru-en" style={{ marginInlineStart: 8 }}>
                          {t("gradeLabel", { grade: vacancy.gradeLevel })}
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
                      <td>
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
