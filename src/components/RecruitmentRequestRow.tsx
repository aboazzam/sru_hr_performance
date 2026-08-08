"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { RecruitmentRequestActions } from "@/components/RecruitmentRequestActions";
import { RequestStatusCell } from "@/components/RequestStatusCell";
import { recruitmentRequestErrorText } from "@/lib/recruitmentRequestErrors";
import { type RecruitmentPermissions } from "@/lib/recruitmentWorkflow";
import {
  deleteRecruitmentRequest,
  updateRecruitmentRequest,
  type RecruitmentRequestActionState,
} from "@/app/[locale]/(app)/recruitment/requests/actions";

export interface RecruitmentRequestRowData {
  id: string;
  status: string;
  headcount: number;
  request_reason: string;
  contract_type: string;
  gender: string | null;
  proposed_quarter: number | null;
  qualifications: string | null;
  estimated_cost_by_requester: number | null;
  estimated_cost_by_hr: number | null;
  plan_id: string | null;
}

const reasonLabelKeys: Record<string, string> = {
  vacant: "reasonVacant",
  expansion: "reasonExpansion",
  replacement: "reasonReplacement",
};

const contractLabelKeys: Record<string, string> = {
  permanent: "contractPermanent",
  temporary: "contractTemporary",
  part_time: "contractPartTime",
};

// غياب القيمة يعني "غير مشترط" لا "غير معروف" — same reading as the column
// this replaced. Gender is set when the request is raised and is not part of
// `updateRecruitmentRequest`'s schema, so the inline editor deliberately
// leaves it alone rather than silently offering a field the server ignores.
const genderLabelKeys: Record<string, string> = {
  Male: "genderMale",
  Female: "genderFemale",
  "": "genderUnspecified",
};

/**
 * One row of طلبات الاحتياج, with inline edit and delete icons.
 *
 * Which icons appear mirrors exactly what the Server Actions allow, so no
 * icon is ever offered for something the server would refuse:
 *   edit   — `draft` or `returned_for_revision` (updateRecruitmentRequest)
 *   delete — `draft` AND not yet consolidated into a plan
 *            (deleteRecruitmentRequest)
 * Both are additionally gated on `canEdit` (`recruitmentRequests>=prepare`),
 * the same bar `recruitment_requests_update`'s own RLS enforces per org unit.
 * The server re-reads status, plan membership and RLS regardless of what is
 * rendered here, so a stale row cannot force either action.
 *
 * The editor opens as a second row spanning the table rather than turning
 * each cell into an input: the request carries fields this table does not
 * show (المؤهلات, the requester's own cost estimate), and a per-cell editor
 * would quietly leave them out of what "save" means.
 */
export function RecruitmentRequestRow({
  request,
  jobTitle,
  orgUnit,
  permissions,
  canEdit,
  columnCount,
}: {
  request: RecruitmentRequestRowData;
  jobTitle: string;
  orgUnit: string;
  permissions: RecruitmentPermissions;
  canEdit: boolean;
  columnCount: number;
}) {
  const t = useTranslations("RecruitmentRequestsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<RecruitmentRequestActionState | null>(null);

  const [headcount, setHeadcount] = useState(String(request.headcount));
  const [reason, setReason] = useState(request.request_reason);
  const [contract, setContract] = useState(request.contract_type);
  const [quarter, setQuarter] = useState(request.proposed_quarter?.toString() ?? "");
  const [qualifications, setQualifications] = useState(request.qualifications ?? "");
  const [cost, setCost] = useState(request.estimated_cost_by_requester?.toString() ?? "");

  const isEditable = request.status === "draft" || request.status === "returned_for_revision";
  const isDeletable = request.status === "draft" && !request.plan_id;

  function resetFields() {
    setHeadcount(String(request.headcount));
    setReason(request.request_reason);
    setContract(request.contract_type);
    setQuarter(request.proposed_quarter?.toString() ?? "");
    setQualifications(request.qualifications ?? "");
    setCost(request.estimated_cost_by_requester?.toString() ?? "");
  }

  function handleSave() {
    setState(null);
    startTransition(async () => {
      const result = await updateRecruitmentRequest({
        requestId: request.id,
        headcount: Number(headcount),
        requestReason: reason,
        contractType: contract,
        proposedQuarter: quarter === "" ? null : Number(quarter),
        qualifications: qualifications.trim() === "" ? null : qualifications.trim(),
        estimatedCostByRequester: cost === "" ? null : Number(cost),
      });
      setState(result);
      if (result.status === "success") {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setState(null);
    startTransition(async () => {
      const result = await deleteRecruitmentRequest(request.id);
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  const errorText =
    state?.status === "error" ? recruitmentRequestErrorText(state.message, t) : null;

  return (
    <>
      <tr>
        <td>{jobTitle}</td>
        <td>{orgUnit}</td>
        <td className="sru-en">{request.headcount}</td>
        <td>{t(reasonLabelKeys[request.request_reason] ?? "reasonVacant")}</td>
        <td>{t(contractLabelKeys[request.contract_type] ?? "contractPermanent")}</td>
        <td>{t(genderLabelKeys[request.gender ?? ""] ?? "genderUnspecified")}</td>
        <td className="sru-en">{request.proposed_quarter ? `Q${request.proposed_quarter}` : "—"}</td>
        <td className="sru-en">
          {request.estimated_cost_by_hr ?? request.estimated_cost_by_requester ?? "—"}
        </td>
        <td>
          <RequestStatusCell
            requestId={request.id}
            status={request.status}
            permissions={permissions}
          />
        </td>
        <td className="sru-col-actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <RecruitmentRequestActions
              requestId={request.id}
              status={request.status}
              permissions={permissions}
            />
            {canEdit && (isEditable || isDeletable) && (
              <div className="sru-icon-action-group">
                {isEditable && (
                  <button
                    type="button"
                    className="sru-icon-action"
                    disabled={pending}
                    onClick={() => {
                      setState(null);
                      resetFields();
                      setEditing((open) => !open);
                    }}
                    title={t("editAction")}
                    aria-label={t("editAction")}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {isDeletable && (
                  <button
                    type="button"
                    className="sru-icon-action danger"
                    disabled={pending}
                    onClick={handleDelete}
                    title={t("deleteAction")}
                    aria-label={t("deleteAction")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            {errorText && !editing && (
              <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
                {errorText}
              </span>
            )}
          </div>
        </td>
      </tr>

      {editing && (
        <tr className="no-print">
          <td colSpan={columnCount} style={{ background: "var(--sru-bg)" }}>
            <div className="sru-formgrid" style={{ padding: "6px 2px 2px" }}>
              <div className="sru-field">
                <label>{t("fieldHeadcount")}</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  dir="ltr"
                  value={headcount}
                  onChange={(event) => setHeadcount(event.target.value)}
                />
              </div>
              <div className="sru-field">
                <label>{t("fieldReason")}</label>
                <select value={reason} onChange={(event) => setReason(event.target.value)}>
                  <option value="vacant">{t("reasonVacant")}</option>
                  <option value="expansion">{t("reasonExpansion")}</option>
                  <option value="replacement">{t("reasonReplacement")}</option>
                </select>
              </div>
              <div className="sru-field">
                <label>{t("fieldContract")}</label>
                <select value={contract} onChange={(event) => setContract(event.target.value)}>
                  <option value="permanent">{t("contractPermanent")}</option>
                  <option value="temporary">{t("contractTemporary")}</option>
                  <option value="part_time">{t("contractPartTime")}</option>
                </select>
              </div>
              <div className="sru-field">
                <label>{t("fieldQuarter")}</label>
                <select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
                  <option value="">{t("quarterUnset")}</option>
                  <option value="1">{t("quarter1")}</option>
                  <option value="2">{t("quarter2")}</option>
                  <option value="3">{t("quarter3")}</option>
                  <option value="4">{t("quarter4")}</option>
                </select>
              </div>
              <div className="sru-field">
                <label>{t("fieldEstimatedCost")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                />
              </div>
              <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
                <label>{t("fieldQualifications")}</label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={qualifications}
                  onChange={(event) => setQualifications(event.target.value)}
                />
              </div>
            </div>

            <div className="sru-icon-action-group" style={{ paddingBottom: 8 }}>
              <button
                type="button"
                className="sru-icon-action primary"
                disabled={pending || headcount.trim() === ""}
                onClick={handleSave}
                title={t("saveEdit")}
                aria-label={t("saveEdit")}
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                className="sru-icon-action"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setState(null);
                  resetFields();
                }}
                title={t("cancel")}
                aria-label={t("cancel")}
              >
                <X size={14} />
              </button>
              {errorText && (
                <span role="alert" className="text-sm text-red-600" style={{ fontSize: 11.5 }}>
                  {errorText}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
