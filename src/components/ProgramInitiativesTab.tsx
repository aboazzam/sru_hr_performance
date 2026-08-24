"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, ClipboardList, Languages, Link2, X } from "lucide-react";
import {
  attachProgramInitiatives,
  createProgramInitiative,
  type ProgramInitiativeState,
} from "@/app/[locale]/(app)/kpis/plans/[id]/programs/initiative-actions";
import { removeProgramInitiative, type ProgramActionState } from "@/app/[locale]/(app)/kpis/plans/[id]/programs/actions";
import { suggestInitiativeTitleEn } from "@/app/[locale]/(app)/kpis/plans/[id]/programs/translate-actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { AddFormDialog } from "@/components/AddFormDialog";

export interface ProgramInitiativeRow {
  rowId: string;
  initiativeId: string;
  code: string | null;
  titleAr: string;
  deliverableAr: string | null;
  subGoalTitle: string | null;
  strategicGoalTitle: string | null;
  ownerOrgUnitName: string | null;
  horizon: string | null;
  statusLabel: string;
  startDate: string | null;
  endDate: string | null;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  duplicate_code: "errorDuplicateCode",
  unknown: "errorUnknown",
};

/**
 * تاب «مبادرات البرنامج» — requested 2026-08-20 because the previous
 * arrangement had no usable way in: the "attach an existing initiative"
 * control was rendered only when unattached initiatives already existed, so
 * on a fresh program it was invisible and the tab read "لا توجد مبادرات
 * مدرجة" with nothing to press.
 *
 * Two ways in, both always visible:
 *   1. إضافة مبادرة — creates a NEW initiative with the full card form and
 *      files it under this program in one step.
 *   2. إدراج مبادرات قائمة — attaches several existing initiatives at once.
 *      Deliberately NOT filtered by goal: a program exists to pull related
 *      initiatives from different goals together.
 */
export function ProgramInitiativesTab({
  programId,
  planId,
  rows,
  availableInitiatives,
  orgUnitOptions,
  subGoalOptions,
  statusOptions,
  canManage,
}: {
  programId: string;
  planId: string;
  rows: ProgramInitiativeRow[];
  availableInitiatives: Array<{ id: string; titleAr: string; subGoalTitle: string | null }>;
  orgUnitOptions: Array<{ id: string; name: string }>;
  subGoalOptions: Array<{ id: string; title: string }>;
  statusOptions: Array<{ code: string; label: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("ProgramInitiativesTab");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"none" | "create" | "attach">("none");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  // The English name is a normal editable field; the button only fills it in.
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [createState, createAction, creating] = useActionState<ProgramInitiativeState, FormData>(createProgramInitiative, null);
  const [attachState, attachAction, attaching] = useActionState<ProgramInitiativeState, FormData>(attachProgramInitiatives, null);
  const [removeState, removeAction] = useActionState<ProgramActionState, FormData>(removeProgramInitiative, null);
  const [handled, setHandled] = useState<ProgramInitiativeState>(null);

  if (createState !== handled) {
    setHandled(createState);
    if (createState?.status === "success") {
      setStartDate("");
      setEndDate("");
      setTitleAr("");
      setTitleEn("");
      setSuggestError(null);
      setMode("none");
    }
  }

  useEffect(() => {
    if (createState?.status === "success" || attachState?.status === "success" || removeState?.status === "success") {
      formRef.current?.reset();
      // Closed only on success: an error keeps the dialog open with its
      // message inside it.
      if (createState?.status === "success") dialogRef.current?.close();
      router.refresh();
    }
  }, [createState, attachState, removeState, router]);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => createAction(formData));
  }

  async function suggestEnglishName() {
    if (titleAr.trim().length < 2) return;
    setSuggesting(true);
    setSuggestError(null);
    const result = await suggestInitiativeTitleEn({ titleAr });
    setSuggesting(false);
    if (result?.status === "success") setTitleEn(result.titleEn);
    else setSuggestError(result?.status === "error" ? result.message : "ai_error");
  }

  function submitAttach() {
    const formData = new FormData();
    formData.set("programId", programId);
    formData.set("initiativeIds", JSON.stringify(picked));
    startTransition(() => attachAction(formData));
    setPicked([]);
    setMode("none");
  }

  const activeError = createState?.status === "error" ? createState : attachState?.status === "error" ? attachState : null;

  const createForm = (
    <form ref={formRef} onSubmit={handleCreate} style={{ marginBottom: 16 }}>
      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <ClipboardList size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("createHeading")}</h3>
            <span>{t("createSubtitle")}</span>
          </div>
        </div>
        <div className="sru-formgrid">
          <input type="hidden" name="programId" value={programId} />
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="startDate" value={startDate} />
          <input type="hidden" name="endDate" value={endDate} />
          <div className="sru-field">
            <label>{t("codeLabel")}</label>
            <input type="text" name="code" required dir="ltr" style={{ textAlign: "left" }} placeholder={t("codePlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("horizonLabel")}</label>
            <input type="text" name="horizon" required dir="ltr" style={{ textAlign: "left" }} placeholder={t("horizonPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("titleArLabel")}</label>
            <input type="text" name="titleAr" required dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          </div>
          <div className="sru-field">
            <label>{t("titleEnLabel")}</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                name="titleEn"
                required
                dir="ltr"
                style={{ textAlign: "left", flex: 1 }}
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
              />
              <button
                type="button"
                className="sru-btn"
                onClick={suggestEnglishName}
                disabled={suggesting || titleAr.trim().length < 2}
                title={t("suggestEnHint")}
                style={{ whiteSpace: "nowrap" }}
              >
                <Languages size={14} aria-hidden />
                {suggesting ? t("suggesting") : t("suggestEn")}
              </button>
            </div>
            {suggestError && (
              <span style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 11.5, marginTop: 4, display: "block" }}>
                {t(suggestError === "rate_limited" ? "suggestRateLimited" : "suggestFailed")}
              </span>
            )}
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("deliverableLabel")}</label>
            <input type="text" name="deliverableAr" required dir="rtl" placeholder={t("deliverablePlaceholder")} />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("definitionLabel")}</label>
            <textarea name="descriptionAr" rows={3} dir="rtl" />
          </div>
          <div className="sru-field">
            <label>{t("subGoalLabel")}</label>
            <select name="subGoalId" required defaultValue="">
              <option value="">{t("subGoalPlaceholder")}</option>
              {subGoalOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {/* Required now, so a plan with no sub-goals yet would be a
                dead end without saying why. */}
            {subGoalOptions.length === 0 && (
              <span style={{ color: "var(--sru-muted)", fontSize: 11.5 }}>{t("subGoalEmptyHint")}</span>
            )}
          </div>
          <div className="sru-field">
            <label>{t("ownerLabel")}</label>
            <select name="ownerOrgUnitId" required defaultValue="">
              <option value="">{t("ownerPlaceholder")}</option>
              {orgUnitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("budgetLabel")}</label>
            <input type="text" name="budgetNote" required dir="rtl" placeholder={t("budgetPlaceholder")} />
          </div>
          <div className="sru-field">
            <label>{t("statusLabel")}</label>
            <select name="statusCode" required defaultValue={statusOptions[0]?.code ?? ""}>
              {statusOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>{t("startDateLabel")}</label>
            <DateFieldDmy value={startDate} onChange={setStartDate} ariaLabel={t("startDateLabel")} />
          </div>
          <div className="sru-field">
            <label>{t("endDateLabel")}</label>
            <DateFieldDmy value={endDate} onChange={setEndDate} ariaLabel={t("endDateLabel")} />
          </div>
        </div>
      </section>

      <div className="sru-form-submitrow">
        <button
          type="submit"
          disabled={creating || startDate === "" || endDate === ""}
          className="sru-btn sru-btn-primary"
        >
          {creating ? t("creating") : t("createSubmit")}
        </button>
        <button type="button" className="sru-btn" onClick={() => setMode("none")}>
          {t("cancel")}
        </button>
        {(startDate === "" || endDate === "") && (
          <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("datesRequiredNote")}</span>
        )}
      </div>
    </form>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <p style={{ color: "var(--sru-muted)", fontSize: 12, lineHeight: 1.8, margin: 0, maxWidth: 620 }}>{t("intro")}</p>
        {canManage && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AddFormDialog
              dialogRef={dialogRef}
              triggerLabel={t("addButton")}
              closeLabel={t("closeButton")}
            >
              {createForm}
            </AddFormDialog>
            <button type="button" className="sru-btn" onClick={() => setMode(mode === "attach" ? "none" : "attach")}>
              <Link2 size={15} aria-hidden />
              {t("attachButton")}
            </button>
          </div>
        )}
      </div>

      {activeError && (
        <p role="alert" className="sru-auth-alert error" style={{ marginBottom: 12 }}>
          <AlertCircle size={15} aria-hidden />
          {t(errorKeys[activeError.message] ?? "errorUnknown")}
        </p>
      )}

      {mode === "attach" && canManage && (
        <div className="sru-position-edit-card" style={{ marginBottom: 16 }}>
          <span className="sru-position-edit-title">{t("attachHeading")}</span>
          {availableInitiatives.length === 0 ? (
            <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 8 }}>{t("attachNoneAvailable")}</p>
          ) : (
            <>
              <p style={{ color: "var(--sru-muted)", fontSize: 11.5, marginTop: 6, marginBottom: 10 }}>{t("attachNote")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {availableInitiatives.map((i) => (
                  <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={picked.includes(i.id)}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, i.id] : picked.filter((x) => x !== i.id))}
                    />
                    <span>
                      {i.titleAr}
                      {i.subGoalTitle && (
                        <span style={{ color: "var(--sru-muted)" }}> — {t("fromSubGoal", { subGoal: i.subGoalTitle })}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" className="sru-btn sru-btn-primary" disabled={attaching || picked.length === 0} onClick={submitAttach}>
                  {attaching ? t("attaching") : t("attachSubmit", { count: picked.length })}
                </button>
                <button type="button" className="sru-btn" onClick={() => setMode("none")}>
                  {t("cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      )}


      {rows.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{canManage ? t("emptyManager") : t("empty")}</p>
      ) : (
        <div className="sru-card">
          <div className="table-scroll">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th>{t("columnCode")}</th>
                  <th>{t("columnInitiative")}</th>
                  <th>{t("columnGoal")}</th>
                  <th>{t("columnOwner")}</th>
                  <th>{t("columnHorizon")}</th>
                  <th>{t("columnStatus")}</th>
                  <th>{t("columnPeriod")}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowId}>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {row.code ?? "—"}
                    </td>
                    <td>
                      {/* The card page: the initiative in full, and what the
                          committee opens to follow the owning department. */}
                      <Link href={`/initiatives/${row.initiativeId}`} style={{ color: "var(--color-primary)", fontWeight: 700, textDecoration: "none" }}>
                        {row.titleAr}
                      </Link>
                      {row.deliverableAr && (
                        <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 11.5 }}>
                          {t("deliverableInline", { deliverable: row.deliverableAr })}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.strategicGoalTitle ?? "—"}
                      {row.subGoalTitle && (
                        <span style={{ display: "block", color: "var(--sru-muted)", fontSize: 11.5 }}>{row.subGoalTitle}</span>
                      )}
                    </td>
                    <td>{row.ownerOrgUnitName ?? "—"}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {row.horizon ?? "—"}
                    </td>
                    <td>{row.statusLabel}</td>
                    <td dir="ltr" style={{ textAlign: "start" }}>
                      {row.startDate || row.endDate ? `${row.startDate ?? "—"} → ${row.endDate ?? "—"}` : "—"}
                    </td>
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
    </div>
  );
}
