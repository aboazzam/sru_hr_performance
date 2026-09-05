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
  /** "مستفيد/عميل" only today (migration 20260906000002) -- data-driven, not a hardcoded relationship_code check. */
  allowsExternalRater: boolean;
}

interface EmployeeOption {
  id: string;
  label: string;
}

interface ExistingNomination {
  relationshipCode: string;
  raterEmployeeId: string | null;
  externalRaterName: string | null;
  externalRaterEmail: string | null;
  /** The real, copyable survey link -- set only once this nomination has been approved and its assignment (with a real access_token) exists. Built server-side; see nominate/page.tsx. */
  externalLink: string | null;
  status: ThreeSixtyNominationStatus;
  reviewNotes: string | null;
  monthsWorkedTogether: number | null;
}

interface ExternalNominee {
  name: string;
  email: string;
  /** Carried straight from the matching `existing` row when this nominee already exists -- null for one just added client-side, not yet submitted. */
  externalLink: string | null;
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
      if (row.raterEmployeeId == null) continue; // external row -- see externalNominees below
      if (!init[row.relationshipCode]) init[row.relationshipCode] = new Set();
      init[row.relationshipCode].add(row.raterEmployeeId);
    }
    return init;
  });
  const [search, setSearch] = useState<Record<string, string>>({});
  const [months, setMonths] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const row of existing) {
      if (row.raterEmployeeId != null && row.monthsWorkedTogether != null) init[row.raterEmployeeId] = String(row.monthsWorkedTogether);
    }
    return init;
  });
  const employeeLabelById = useMemo(() => new Map(employees.map((e) => [e.id, e.label])), [employees]);

  // "اسمح للخارجي بالإجابة على الاستبيان من خلال الايميل الخاص به من غير
  // دخول على النظام" (2026-09-06) -- a parallel, non-employee-id-based
  // selection track, only ever populated for groups with
  // `allowsExternalRater` (the server independently re-validates this, see
  // nominate/actions.ts -- this is a UX convenience, not the real gate).
  const [externalNominees, setExternalNominees] = useState<Record<string, ExternalNominee[]>>(() => {
    const init: Record<string, ExternalNominee[]> = {};
    for (const group of raterGroups) init[group.relationshipCode] = [];
    for (const row of existing) {
      if (!row.externalRaterEmail) continue;
      if (!init[row.relationshipCode]) init[row.relationshipCode] = [];
      init[row.relationshipCode].push({
        name: row.externalRaterName ?? "",
        email: row.externalRaterEmail,
        externalLink: row.externalLink,
      });
    }
    return init;
  });
  const [externalDraft, setExternalDraft] = useState<Record<string, { name: string; email: string }>>({});
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  function addExternalNominee(relationshipCode: string) {
    const draft = externalDraft[relationshipCode];
    const name = draft?.name.trim() ?? "";
    const email = draft?.email.trim() ?? "";
    if (!name || !email) return;
    setExternalNominees((prev) => {
      const list = prev[relationshipCode] ?? [];
      if (list.some((n) => n.email.toLowerCase() === email.toLowerCase())) return prev; // already added, ignore silently -- the input still clears below
      return { ...prev, [relationshipCode]: [...list, { name, email, externalLink: null }] };
    });
    setExternalDraft((prev) => ({ ...prev, [relationshipCode]: { name: "", email: "" } }));
  }

  function removeExternalNominee(relationshipCode: string, email: string) {
    setExternalNominees((prev) => ({
      ...prev,
      [relationshipCode]: (prev[relationshipCode] ?? []).filter((n) => n.email.toLowerCase() !== email.toLowerCase()),
    }));
  }

  async function copyLink(link: string, email: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedEmail(email);
      window.setTimeout(() => setCopiedEmail((prev) => (prev === email ? null : prev)), 2000);
    } catch {
      // clipboard access can fail (permissions, insecure context) -- the
      // link is still selectable/copyable by hand from the visible text.
    }
  }

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
    () =>
      Object.values(selections).reduce((sum, set) => sum + set.size, 0) +
      Object.values(externalNominees).reduce((sum, list) => sum + list.length, 0),
    [selections, externalNominees]
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
    const externalPayload: Record<string, { name: string; email: string }[]> = {};
    for (const [code, list] of Object.entries(externalNominees)) {
      if (list.length > 0) externalPayload[code] = list.map((n) => ({ name: n.name, email: n.email }));
    }
    formData.set("externalByGroup", JSON.stringify(externalPayload));
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
        const externalList = externalNominees[group.relationshipCode] ?? [];
        const draft = externalDraft[group.relationshipCode] ?? { name: "", email: "" };
        return (
          <section key={group.relationshipCode} className="sru-formsection">
            <div className="sru-formsection-head">
              <div>
                <h3>{group.nameAr}</h3>
                <span>
                  {t("groupBoundsNote", {
                    min: group.minRatersInGroup,
                    max: group.maxRatersInGroup ?? "∞",
                    selected: selectedSet.size + externalList.length,
                  })}
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

            {group.allowsExternalRater && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--sru-border)", paddingTop: 10 }}>
                <p style={{ fontSize: 11, color: "var(--sru-muted)", marginBottom: 6 }}>{t("externalHeading")}</p>
                {externalList.map((nominee) => (
                  <div
                    key={nominee.email}
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}
                  >
                    <span style={{ fontSize: 12 }}>
                      {nominee.name} ({nominee.email})
                    </span>
                    {nominee.externalLink ? (
                      <button
                        type="button"
                        className="sru-btn sru-btn-slim"
                        onClick={() => copyLink(nominee.externalLink!, nominee.email)}
                      >
                        {copiedEmail === nominee.email ? t("linkCopied") : t("copyLinkButton")}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--sru-muted)" }}>{t("linkPendingApproval")}</span>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        className="sru-icon-action danger"
                        onClick={() => removeExternalNominee(group.relationshipCode, nominee.email)}
                        aria-label={t("removeExternalButton")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {!locked && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder={t("externalNamePlaceholder")}
                      value={draft.name}
                      onChange={(e) => setExternalDraft((prev) => ({ ...prev, [group.relationshipCode]: { ...draft, name: e.target.value } }))}
                      style={{ flex: 1, minWidth: 140 }}
                    />
                    <input
                      type="email"
                      placeholder={t("externalEmailPlaceholder")}
                      value={draft.email}
                      onChange={(e) => setExternalDraft((prev) => ({ ...prev, [group.relationshipCode]: { ...draft, email: e.target.value } }))}
                      style={{ flex: 1, minWidth: 180 }}
                    />
                    <button
                      type="button"
                      className="sru-btn sru-btn-slim"
                      disabled={!draft.name.trim() || !draft.email.trim()}
                      onClick={() => addExternalNominee(group.relationshipCode)}
                    >
                      {t("addExternalButton")}
                    </button>
                  </div>
                )}
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
