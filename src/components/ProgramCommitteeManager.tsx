"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowDown, ArrowUp, Building2, UserPlus, X } from "lucide-react";
import {
  addCommitteeMember,
  removeCommitteeMember,
  reorderCommitteeMembers,
  type ProgramActionState,
} from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";
import { reorderIds } from "@/lib/reorder";

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

function ActionError({ state }: { state: ProgramActionState }) {
  const t = useTranslations("ProgramCommittee");
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
  /** Internal member: the employee's name. External: the recorded name. */
  name: string;
  /** Employee number for internal members, affiliation for external ones. */
  subtitle: string;
  committeeRole: string | null;
  isExternal: boolean;
}

/**
 * اللجنة المشرفة — internal employees and external members side by side, in
 * an order the manager controls.
 *
 * Membership now carries real powers (20260820000005): an INTERNAL member may
 * run the program and manage which initiatives sit under it, with no
 * strategic-planning grant. It still does not let them edit the roster or the
 * initiatives' own content. An EXTERNAL member has no account here at all, so
 * there is nothing to authenticate — they are recorded so the committee is
 * complete, and the form says so plainly rather than implying access they do
 * not have.
 */
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
  const [kind, setKind] = useState<"internal" | "external">("internal");
  const [addState, addAction, adding] = useActionState<ProgramActionState, FormData>(addCommitteeMember, null);
  const [removeState, removeAction] = useActionState<ProgramActionState, FormData>(removeCommitteeMember, null);
  const [orderState, orderAction] = useActionState<ProgramActionState, FormData>(reorderCommitteeMembers, null);

  useEffect(() => {
    if (addState?.status === "success" || removeState?.status === "success" || orderState?.status === "success") {
      router.refresh();
    }
  }, [addState, removeState, orderState, router]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= members.length) return;
    // reorderIds is the same pure, unit-tested helper the org-structure levels
    // list uses, so "move one step" and "drag onto another row" stay one
    // implementation.
    const next = reorderIds(
      members.map((m) => m.rowId),
      members[index].rowId,
      members[target].rowId
    );
    const formData = new FormData();
    formData.set("programId", programId);
    formData.set("memberIds", JSON.stringify(next));
    startTransition(() => orderAction(formData));
  }

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, marginBottom: 16 }}>{t("intro")}</p>

      {members.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>{t("columnMember")}</th>
                  <th>{t("columnRole")}</th>
                  <th>{t("columnKind")}</th>
                  {canManage && <th>{t("columnOrder")}</th>}
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
                  <tr key={member.rowId}>
                    <td>{index + 1}</td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{member.name}</span>
                      <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 11.5 }}>{member.subtitle}</span>
                    </td>
                    <td>{member.committeeRole ?? "—"}</td>
                    <td>
                      <span className="pill">
                        {member.isExternal ? (
                          <>
                            <Building2 size={12} aria-hidden style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
                            {t("kindExternal")}
                          </>
                        ) : (
                          t("kindInternal")
                        )}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="sru-icon-action"
                            title={t("moveUp")}
                            aria-label={t("moveUp")}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="sru-icon-action"
                            title={t("moveDown")}
                            aria-label={t("moveDown")}
                            disabled={index === members.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={14} aria-hidden />
                          </button>
                        </div>
                      </td>
                    )}
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

      {canManage && (
        <form action={(fd) => startTransition(() => addAction(fd))} style={{ marginTop: 18 }}>
          <input type="hidden" name="programId" value={programId} />
          <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="radio" name="memberKind" checked={kind === "internal"} onChange={() => setKind("internal")} />
              {t("kindInternal")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="radio" name="memberKind" checked={kind === "external"} onChange={() => setKind("external")} />
              {t("kindExternal")}
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
            {kind === "internal" ? (
              <div className="sru-field" style={{ minWidth: 260 }}>
                <label>{t("memberLabel")}</label>
                <select name="memberProfileId" required defaultValue="">
                  <option value="" disabled>
                    {t("memberPlaceholder")}
                  </option>
                  {employeeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="sru-field" style={{ minWidth: 220 }}>
                  <label>{t("externalNameLabel")}</label>
                  <input type="text" name="externalName" required dir="rtl" />
                </div>
                <div className="sru-field" style={{ minWidth: 200 }}>
                  <label>{t("externalOrgLabel")}</label>
                  <input type="text" name="externalOrg" dir="rtl" />
                </div>
                <div className="sru-field" style={{ minWidth: 200 }}>
                  <label>{t("externalEmailLabel")}</label>
                  <input type="email" name="externalEmail" dir="ltr" style={{ textAlign: "left" }} />
                </div>
              </>
            )}
            <div className="sru-field" style={{ minWidth: 180 }}>
              <label>{t("roleLabel")}</label>
              <input type="text" name="committeeRole" dir="rtl" placeholder={t("rolePlaceholder")} />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="sru-btn sru-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <UserPlus size={15} aria-hidden />
              {t("addButton")}
            </button>
          </div>

          {kind === "external" && <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 8 }}>{t("externalNote")}</p>}
        </form>
      )}

      <ActionError state={addState} />
      <ActionError state={removeState} />
      <ActionError state={orderState} />
    </div>
  );
}
