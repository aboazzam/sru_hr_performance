"use client";

import { useActionState, useEffect, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, UserPlus, X } from "lucide-react";
import {
  addCommitteeMember,
  removeCommitteeMember,
  addProgramInitiative,
  removeProgramInitiative,
  type ProgramActionState,
} from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

function ActionError({ state, namespace }: { state: ProgramActionState; namespace: "ProgramCommittee" | "ProgramDetail" }) {
  const t = useTranslations(namespace);
  if (state?.status !== "error") return null;
  return (
    <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
      <AlertCircle size={15} aria-hidden />
      {t(errorKeys[state.message] ?? "errorUnknown")}
    </p>
  );
}

export interface CommitteeMemberView {
  rowId: string;
  name: string;
  employeeNumber: string;
  committeeRole: string | null;
}

/** اللجنة المشرفة sub-tab. Membership is what grants a member read access to
 *  the whole program (20260819000002), so this roster is also the access
 *  list — worth stating in the UI, which `intro` does. */
export function ProgramCommitteeManager({
  programId,
  members,
  employeeOptions,
  canManage,
}: {
  programId: string;
  members: CommitteeMemberView[];
  employeeOptions: Array<{ id: string; label: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("ProgramCommittee");
  const router = useRouter();
  const [addState, addAction, adding] = useActionState<ProgramActionState, FormData>(addCommitteeMember, null);
  const [removeState, removeAction] = useActionState<ProgramActionState, FormData>(removeCommitteeMember, null);

  useEffect(() => {
    if (addState?.status === "success" || removeState?.status === "success") router.refresh();
  }, [addState, removeState, router]);

  const memberIds = new Set(members.map((m) => m.employeeNumber));
  const available = employeeOptions.filter((o) => !memberIds.has(o.label));

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>{t("intro")}</p>

      {members.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnMember")}</th>
                  <th>{t("columnRole")}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.rowId}>
                    <td>
                      <span style={{ fontWeight: 700 }}>{member.name}</span>
                      <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 12 }}>{member.employeeNumber}</span>
                    </td>
                    <td>{member.committeeRole ?? "—"}</td>
                    {canManage && (
                      <td>
                        <form action={(fd) => startTransition(() => removeAction(fd))}>
                          <input type="hidden" name="rowId" value={member.rowId} />
                          <button type="submit" className="sru-icon-action" title={t("removeButton")} aria-label={t("removeButton")}>
                            <X size={15} aria-hidden />
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && available.length > 0 && (
        <form
          action={(fd) => startTransition(() => addAction(fd))}
          style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}
        >
          <input type="hidden" name="programId" value={programId} />
          <div className="sru-field" style={{ minWidth: 260 }}>
            <label>{t("memberLabel")}</label>
            <select name="memberProfileId" required defaultValue="">
              <option value="" disabled>
                {t("memberPlaceholder")}
              </option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field" style={{ minWidth: 180 }}>
            <label>{t("roleLabel")}</label>
            <input type="text" name="committeeRole" dir="rtl" placeholder={t("rolePlaceholder")} />
          </div>
          <button type="submit" disabled={adding} className="sru-btn sru-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <UserPlus size={15} aria-hidden />
            {t("addButton")}
          </button>
        </form>
      )}

      <ActionError state={addState} namespace="ProgramCommittee" />
      <ActionError state={removeState} namespace="ProgramCommittee" />
    </div>
  );
}

export interface ProgramInitiativeView {
  rowId: string;
  initiativeId: string;
  titleAr: string;
  ownerPositionName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  targetLabels: string[];
}

/** تفصيل البرنامج sub-tab: which initiatives sit under this program, what each
 *  serves, and which position is carrying it. */
export function ProgramInitiativesManager({
  programId,
  initiatives,
  availableInitiatives,
  canManage,
}: {
  programId: string;
  initiatives: ProgramInitiativeView[];
  availableInitiatives: Array<{ id: string; titleAr: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("ProgramDetail");
  const router = useRouter();
  const [addState, addAction, adding] = useActionState<ProgramActionState, FormData>(addProgramInitiative, null);
  const [removeState, removeAction] = useActionState<ProgramActionState, FormData>(removeProgramInitiative, null);

  useEffect(() => {
    if (addState?.status === "success" || removeState?.status === "success") router.refresh();
  }, [addState, removeState, router]);

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>{t("intro")}</p>

      {initiatives.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnInitiative")}</th>
                  <th>{t("columnOwner")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnPeriod")}</th>
                  <th>{t("columnTargets")}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {initiatives.map((row) => (
                  <tr key={row.rowId}>
                    <td style={{ fontWeight: 700 }}>{row.titleAr}</td>
                    <td>{row.ownerPositionName ?? "—"}</td>
                    <td>{row.status}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {row.startDate || row.endDate ? `${row.startDate ?? "—"} → ${row.endDate ?? "—"}` : "—"}
                    </td>
                    <td>{row.targetLabels.length > 0 ? row.targetLabels.join("، ") : "—"}</td>
                    {canManage && (
                      <td>
                        <form action={(fd) => startTransition(() => removeAction(fd))}>
                          <input type="hidden" name="rowId" value={row.rowId} />
                          <button type="submit" className="sru-icon-action" title={t("removeButton")} aria-label={t("removeButton")}>
                            <X size={15} aria-hidden />
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && availableInitiatives.length > 0 && (
        <form
          action={(fd) => startTransition(() => addAction(fd))}
          style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}
        >
          <input type="hidden" name="programId" value={programId} />
          <div className="sru-field" style={{ minWidth: 300 }}>
            <label>{t("addInitiativeLabel")}</label>
            <select name="initiativeId" required defaultValue="">
              <option value="" disabled>
                {t("addInitiativePlaceholder")}
              </option>
              {availableInitiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.titleAr}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={adding} className="sru-btn sru-btn-primary">
            {t("addInitiativeButton")}
          </button>
        </form>
      )}

      <ActionError state={addState} namespace="ProgramDetail" />
      <ActionError state={removeState} namespace="ProgramDetail" />
    </div>
  );
}
