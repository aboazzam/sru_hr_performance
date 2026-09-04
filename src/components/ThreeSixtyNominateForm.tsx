"use client";

import { useActionState, useEffect, useMemo, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { submitThreeSixtyNominations, type SubmitNominationsState } from "@/app/[locale]/(app)/three-sixty/nominate/actions";
import { threeSixtyNominationStatusLabels, type ThreeSixtyNominationStatus } from "@/lib/threeSixty";
import { includesIgnoringHamza } from "@/lib/arabicSearch";

interface RaterGroupOption {
  relationshipCode: string;
  nameAr: string;
  minRatersInGroup: number;
  maxRatersInGroup: number | null;
}

interface EmployeeOption {
  id: string;
  label: string;
}

interface ExistingNomination {
  relationshipCode: string;
  raterEmployeeId: string;
  status: ThreeSixtyNominationStatus;
  reviewNotes: string | null;
  monthsWorkedTogether: number | null;
}

export function ThreeSixtyNominateForm({
  cycle,
  raterGroups,
  employees,
  existing,
}: {
  cycle: { id: string; nameAr: string; minRaters: number; maxRaters: number | null };
  raterGroups: RaterGroupOption[];
  employees: EmployeeOption[];
  existing: ExistingNomination[];
}) {
  const t = useTranslations("ThreeSixtyNominatePage");
  const router = useRouter();

  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const group of raterGroups) init[group.relationshipCode] = new Set();
    for (const row of existing) {
      if (!init[row.relationshipCode]) init[row.relationshipCode] = new Set();
      init[row.relationshipCode].add(row.raterEmployeeId);
    }
    return init;
  });
  const [search, setSearch] = useState<Record<string, string>>({});
  const [months, setMonths] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const row of existing) {
      if (row.monthsWorkedTogether != null) init[row.raterEmployeeId] = String(row.monthsWorkedTogether);
    }
    return init;
  });
  const employeeLabelById = useMemo(() => new Map(employees.map((e) => [e.id, e.label])), [employees]);

  const locked = existing.some((e) => e.status === "submitted" || e.status === "approved");
  const returnedNote = existing.find((e) => e.status === "returned" && e.reviewNotes)?.reviewNotes;
  const overallStatus: ThreeSixtyNominationStatus | null =
    existing.length === 0
      ? null
      : existing.some((e) => e.status === "approved")
        ? "approved"
        : existing.some((e) => e.status === "submitted")
          ? "submitted"
          : existing.some((e) => e.status === "returned")
            ? "returned"
            : "draft";

  const [state, formAction] = useActionState<SubmitNominationsState, FormData>(submitThreeSixtyNominations, null);

  function toggle(relationshipCode: string, employeeId: string) {
    setSelections((prev) => {
      const next = { ...prev, [relationshipCode]: new Set(prev[relationshipCode] ?? []) };
      if (next[relationshipCode].has(employeeId)) next[relationshipCode].delete(employeeId);
      else next[relationshipCode].add(employeeId);
      return next;
    });
  }

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((sum, set) => sum + set.size, 0),
    [selections]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("cycleId", cycle.id);
    const payload: Record<string, string[]> = {};
    for (const [code, set] of Object.entries(selections)) payload[code] = [...set];
    formData.set("selections", JSON.stringify(payload));
    const monthsPayload: Record<string, number> = {};
    for (const [raterId, value] of Object.entries(months)) {
      const n = Number(value);
      if (value.trim() !== "" && Number.isFinite(n)) monthsPayload[raterId] = n;
    }
    formData.set("monthsByRaterId", JSON.stringify(monthsPayload));
    startTransition(() => formAction(formData));
  }

  // In useEffect, not the render body: found during review that this was
  // the one component in this PR calling router.refresh() directly during
  // render -- since refresh() doesn't unmount the component (unlike the
  // router.push() calls elsewhere in this module), state.status stays
  // 'success' across the resulting re-render and the render body would
  // call refresh() again, forever. useEffect's [state] dependency only
  // re-fires on a genuine new action-state object (a fresh submission),
  // matching every other action-state component in this module.
  useEffect(() => {
    if (state?.status === "success") router.refresh();
  }, [state, router]);

  return (
    <form onSubmit={handleSubmit}>
      <div className="sru-card" style={{ marginBottom: 18, padding: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>{cycle.nameAr}</p>
        <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: 4 }}>
          {t("boundsNote", { min: cycle.minRaters, max: cycle.maxRaters ?? "∞" })}
        </p>
        {overallStatus && (
          <p style={{ marginTop: 8 }}>
            <span className="pill">{threeSixtyNominationStatusLabels[overallStatus]}</span>
          </p>
        )}
        {returnedNote && (
          <p role="alert" className="sru-auth-alert error" style={{ marginTop: 10 }}>
            {t("returnedNotePrefix")} {returnedNote}
          </p>
        )}
      </div>

      {raterGroups.map((group) => {
        const query = search[group.relationshipCode] ?? "";
        const filtered = query
          ? employees.filter((e) => includesIgnoringHamza(e.label, query))
          : employees;
        const selectedSet = selections[group.relationshipCode] ?? new Set<string>();
        return (
          <section key={group.relationshipCode} className="sru-formsection">
            <div className="sru-formsection-head">
              <div>
                <h3>{group.nameAr}</h3>
                <span>
                  {t("groupBoundsNote", { min: group.minRatersInGroup, max: group.maxRatersInGroup ?? "∞", selected: selectedSet.size })}
                </span>
              </div>
            </div>
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={query}
              disabled={locked}
              onChange={(e) => setSearch((prev) => ({ ...prev, [group.relationshipCode]: e.target.value }))}
              style={{ marginBottom: 8 }}
            />
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--sru-border)", borderRadius: 8, padding: 8 }}>
              {filtered.map((employee) => (
                <label key={employee.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 0" }}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={selectedSet.has(employee.id)}
                    onChange={() => toggle(group.relationshipCode, employee.id)}
                  />
                  {employee.label}
                </label>
              ))}
              {filtered.length === 0 && (
                <p style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("noMatches")}</p>
              )}
            </div>

            {selectedSet.size > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 11, color: "var(--sru-muted)", marginBottom: 6 }}>{t("monthsTogetherHeading")}</p>
                {[...selectedSet].map((raterId) => (
                  <div key={raterId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, flex: 1 }}>{employeeLabelById.get(raterId) ?? raterId}</span>
                    <input
                      type="number"
                      min={0}
                      disabled={locked}
                      value={months[raterId] ?? ""}
                      onChange={(e) => setMonths((prev) => ({ ...prev, [raterId]: e.target.value }))}
                      placeholder={t("monthsTogetherPlaceholder")}
                      style={{ width: 90 }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <p style={{ fontSize: 11.5, color: "var(--sru-muted)", marginTop: 6 }}>{t("totalSelected", { total: totalSelected })}</p>

      {state?.status === "error" && (
        <div role="alert" className="sru-auth-alert error" style={{ display: "block", marginTop: 10 }}>
          <p>{t(state.message === "locked" ? "errorLocked" : "errorInvalidInput")}</p>
          {state.errors && state.errors.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" className="sru-btn sru-btn-primary" disabled={locked}>
          {t("submitButton")}
        </button>
      </div>
    </form>
  );
}
