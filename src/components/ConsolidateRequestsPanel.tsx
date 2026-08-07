"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Layers, PenLine } from "lucide-react";
import { RecruitmentRequestActions } from "@/components/RecruitmentRequestActions";
import { requestStatusLabel, type RecruitmentPermissions } from "@/lib/recruitmentWorkflow";
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
 * Only requests already at `under_hr_review` can be selected — that is the
 * one state the transition table allows into `included_in_plan`, so the
 * checkbox mirrors the guard instead of inventing a second rule. A request
 * still at `submitted` shows its own "start review" action instead, from the
 * shared RecruitmentRequestActions component.
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
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState(initialRecommendation);
  const [savedRecommendation, setSavedRecommendation] = useState(initialRecommendation);

  const mergeable = requests.filter((request) => request.status === "under_hr_review");

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
    startTransition(async () => {
      const result = await setRequestHrCost({
        requestId,
        estimatedCostByHr: raw === undefined || raw.trim() === "" ? null : Number(raw),
      });
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  function saveRecommendation() {
    startTransition(async () => {
      const result = await savePlanHrRecommendation({ planId, hrRecommendation: recommendation });
      setState(result);
      if (result.status === "success") {
        setSavedRecommendation(recommendation);
        router.refresh();
      }
    });
  }

  function merge() {
    startTransition(async () => {
      const result = await consolidateRequestsIntoPlan({ planId, requestIds: selected });
      setState(result);
      if (result.status === "success") {
        setSelected([]);
        router.refresh();
      }
    });
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
          <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("noRequests")}</p>
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
                  const canSelect = request.status === "under_hr_review";
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
                            type="number"
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
                            disabled={pending || costs[request.id] === undefined}
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
            disabled={pending || selected.length === 0}
            onClick={merge}
          >
            {t("mergeButton", { count: selected.length })}
          </button>
          {state?.status === "success" && state.createdCount !== undefined && (
            <span role="status" style={{ color: "var(--sru-success, #15803d)", fontSize: 13 }}>
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
        <p style={{ color: "var(--sru-muted)", fontSize: 12, marginBottom: 8 }}>
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
            disabled={pending || recommendation.trim() === "" || recommendation === savedRecommendation}
            onClick={saveRecommendation}
          >
            {t("saveRecommendation")}
          </button>
        </div>
      </div>
    </div>
  );
}
