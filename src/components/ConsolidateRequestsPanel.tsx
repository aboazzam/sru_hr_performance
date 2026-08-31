"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Layers, PenLine } from "lucide-react";
import { RecruitmentRequestActions } from "@/components/RecruitmentRequestActions";
import {
  isRequestMergeable,
  requestStatusLabel,
  type RecruitmentPermissions,
} from "@/lib/recruitmentWorkflow";
import {
  consolidateRequestsIntoPlan,
  savePlanHrRecommendation,
  setRequestHrCost,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

interface RequestRow {
  id: string;
  status: string;
  org_unit_id: string;
  job_title_id: string | null;
  custom_job_title: string | null;
  headcount: number;
  request_reason: string;
  proposed_quarter: number | null;
  estimated_cost_by_requester: number | null;
  estimated_cost_by_hr: number | null;
}

/**
 * HR's merge screen: pick requests, price them, write the recommendation.
 *
 * Only requests HR has already reviewed can be selected — `isRequestMergeable`
 * is the same function the Server Action applies, so the checkbox cannot
 * offer something the server would refuse. A request still under review shows
 * its own review actions instead, from RecruitmentRequestActions.
 *
 * Merging records plan membership only; it no longer moves the request's
 * status (20260808000003), since status now says who must act next and plan
 * membership is a separate fact.
 *
 * The server re-reads and re-checks every selected request anyway and SKIPS
 * the ones it may not move, so a stale checkbox can never corrupt a merge —
 * it just shows up in the skipped count.
 */
export function ConsolidateRequestsPanel({
  planId,
  requests,
  orgUnitName,
  jobTitleName,
  permissions,
  initialRecommendation,
}: {
  planId: string;
  requests: RequestRow[];
  orgUnitName: Record<string, string>;
  jobTitleName: Record<string, string>;
  permissions: RecruitmentPermissions;
  initialRecommendation: string;
}) {
  const t = useTranslations("RecruitmentConsolidatePage");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState(initialRecommendation);
  const [savedRecommendation, setSavedRecommendation] = useState(initialRecommendation);

  // WHICH action is running, not merely WHETHER one is.
  //
  // `useTransition`'s own `pending` is a single flag for the whole component,
  // and this panel hosts three unrelated action families (per-row pricing, the
  // recommendation, the merge). Sharing it meant saving the recommendation
  // disabled the merge button — and it stayed disabled until `router.refresh()`
  // finished re-rendering the server component, which in dev took several
  // seconds. Observed live during the end-to-end run: a merge click landed in
  // that window and was silently swallowed, so nothing merged and nothing
  // explained why.
  //
  // Each button now reflects only its own key, so one save never freezes an
  // unrelated control. The keys are deliberately per-ROW for pricing
  // (`cost:<id>`), since saving one row's cost has nothing to do with another's.
  const [busy, setBusy] = useState<string | null>(null);

  const mergeable = requests.filter((request) => isRequestMergeable(request.status));

  /**
   * Runs one action under its own key. `busy` is cleared in a `finally`, so a
   * failing action can never leave its button disabled forever — the failure
   * mode that would be worse than the bug this replaces.
   */
  function run(key: string, action: () => Promise<RecruitmentRequestActionState>, onSuccess?: () => void) {
    setBusy(key);
    startTransition(async () => {
      try {
        const result = await action();
        setState(result);
        if (result.status === "success") {
          onSuccess?.();
          router.refresh();
        }
      } finally {
        setBusy(null);
      }
    });
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  }

  function toggleAll() {
    setSelected((current) => (current.length === mergeable.length ? [] : mergeable.map((r) => r.id)));
  }

  function saveCost(requestId: string) {
    const raw = costs[requestId];
    run(`cost:${requestId}`, () =>
      setRequestHrCost({
        requestId,
        estimatedCostByHr: raw === undefined || raw.trim() === "" ? null : Number(raw),
      })
    );
  }

  function saveRecommendation() {
    run(
      "recommendation",
      () => savePlanHrRecommendation({ planId, hrRecommendation: recommendation }),
      () => setSavedRecommendation(recommendation)
    );
  }

  function merge() {
    run("merge", () => consolidateRequestsIntoPlan({ planId, requestIds: selected }), () =>
      setSelected([])
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Layers size={16} aria-hidden />
          </span>
          <h2>{t("unmergedHeading")}</h2>
        </div>

        {requests.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("noRequests")}</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={mergeable.length > 0 && selected.length === mergeable.length}
                      disabled={mergeable.length === 0}
                      onChange={toggleAll}
                      aria-label={t("selectAll")}
                    />
                  </th>
                  <th>{t("columnJobTitle")}</th>
                  <th>{t("columnOrgUnit")}</th>
                  <th>{t("columnHeadcount")}</th>
                  <th>{t("columnRequesterCost")}</th>
                  <th>{t("columnHrCost")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const canSelect = isRequestMergeable(request.status);
                  const costValue =
                    costs[request.id] ??
                    (request.estimated_cost_by_hr === null ? "" : String(request.estimated_cost_by_hr));
                  return (
                    <tr key={request.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(request.id)}
                          disabled={!canSelect}
                          onChange={() => toggle(request.id)}
                          aria-label={t("selectRow")}
                        />
                      </td>
                      <td>
                        {request.job_title_id
                          ? (jobTitleName[request.job_title_id] ?? "—")
                          : (request.custom_job_title ?? "—")}
                      </td>
                      <td>{orgUnitName[request.org_unit_id] ?? "—"}</td>
                      <td className="sru-en">{request.headcount}</td>
                      <td className="sru-en">{request.estimated_cost_by_requester ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="text" inputMode="decimal"
                            min={0}
                            step="0.01"
                            dir="ltr"
                            style={{ width: 110 }}
                            value={costValue}
                            onChange={(event) =>
                              setCosts((current) => ({ ...current, [request.id]: event.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="sru-btn"
                            disabled={busy === `cost:${request.id}` || costs[request.id] === undefined}
                            onClick={() => saveCost(request.id)}
                          >
                            {t("saveCost")}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="pill">{requestStatusLabel(request.status)}</span>
                      </td>
                      <td>
                        <RecruitmentRequestActions
                          requestId={request.id}
                          status={request.status}
                          permissions={permissions}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="sru-form-submitrow">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            disabled={busy === "merge" || selected.length === 0}
            onClick={merge}
          >
            {t("mergeButton", { count: selected.length })}
          </button>
          {state?.status === "success" && state.createdCount !== undefined && (
            <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 12 }}>
              {t("mergeDone", { created: state.createdCount, skipped: state.skippedCount ?? 0 })}
            </span>
          )}
          {state?.status === "error" && (
            <span role="alert" className="text-sm text-red-600">
              {t("errorGeneric")}
            </span>
          )}
        </div>
      </div>

      <div className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <PenLine size={16} aria-hidden />
          </span>
          <h2>{t("recommendationHeading")}</h2>
        </div>
        <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginBottom: 8 }}>
          {t("recommendationHint")}
        </p>
        <textarea
          rows={4}
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          style={{ width: "100%" }}
        />
        <div className="sru-form-submitrow">
          <button
            type="button"
            className="sru-btn sru-btn-primary"
            // Dirty-state save, the project's established convention.
            disabled={
              busy === "recommendation" ||
              recommendation.trim() === "" ||
              recommendation === savedRecommendation
            }
            onClick={saveRecommendation}
          >
            {t("saveRecommendation")}
          </button>
        </div>
      </div>
    </div>
  );
}
