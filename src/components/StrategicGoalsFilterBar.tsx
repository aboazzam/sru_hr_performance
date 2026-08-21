"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

export interface FilterableGoal {
  id: string;
  title: string;
  /** Owning positions of this goal's sub-goals — what "الجهة" filters on. */
  ownerPositionIds: string[];
  /** The goal card, rendered on the server and handed over as-is. */
  content: ReactNode;
}

/**
 * The goals list with the same filter bar the initiatives list has
 * (2026-08-21 request), and for the same reason: a plan's goals screen is long
 * and mostly read, so narrowing it beats scrolling it.
 *
 * Two filters, not three: `strategic_goals` and `sub_goals` carry NO status
 * column (checked against the live schema, not assumed), so a status filter
 * here would have nothing real to read. What exists is the goal itself and the
 * position owning each sub-goal, so those are what filter.
 *
 * The cards themselves are rendered on the server and passed through as
 * `content` — the same handover `ProfileTabs` already uses — so this component
 * only decides which of them show.
 */
export function StrategicGoalsFilterBar({
  goals,
  ownerOptions,
}: {
  goals: FilterableGoal[];
  ownerOptions: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("StrategicGoalsPage");
  const [goalFilter, setGoalFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const visible = goals.filter(
    (g) =>
      (goalFilter === "" || g.id === goalFilter) &&
      (ownerFilter === "" || g.ownerPositionIds.includes(ownerFilter))
  );

  return (
    <div>
      {goals.length > 0 && (
        <div className="sru-filterbar no-print">
          <label>
            <span>{t("filterGoal")}</span>
            <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)}>
              <option value="">{t("filterAll")}</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("filterOwner")}</span>
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="">{t("filterAll")}</option>
              {ownerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {(goalFilter || ownerFilter) && (
            <>
              <span className="sru-filterbar-count">
                {t("filterCount", { shown: visible.length, total: goals.length })}
              </span>
              <button
                type="button"
                className="sru-filterbar-reset"
                onClick={() => {
                  setGoalFilter("");
                  setOwnerFilter("");
                }}
              >
                {t("filterReset")}
              </button>
            </>
          )}
        </div>
      )}

      {goals.length > 0 && visible.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("filterEmpty")}</p>
      ) : (
        visible.map((g) => <div key={g.id}>{g.content}</div>)
      )}
    </div>
  );
}
