"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, ArrowLeft, Eye, Link2, Pencil, Trash2, X } from "lucide-react";
import {
  createInitiative,
  deleteInitiative,
  linkInitiativeTarget,
  unlinkInitiativeTarget,
  type InitiativeActionState,
} from "@/app/[locale]/(app)/kpis/plans/[id]/initiatives/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { InitiativeProgressRing } from "@/components/InitiativeProgressRing";
import { AddFormDialog } from "@/components/AddFormDialog";
import { initiativeProgress } from "@/lib/initiativeProgress";
import { formatDateDmy } from "@/lib/dateParts";

export interface InitiativeTargetOption {
  /** "kpi:<id>" or "annual:<id>" — one value space, matching the link table's XOR. */
  value: string;
  label: string;
}

export interface InitiativeLinkView {
  id: string;
  label: string;
}

export interface InitiativeView {
  id: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  /** الإدارة المالكة — an org unit since 20260820000003, not a position. */
  ownerOrgUnitName: string | null;
  /** الهدف الفرعي the initiative serves, shown on the real initiative cards. */
  subGoalTitle: string | null;
  startDate: string | null;
  endDate: string | null;
  statusLabel: string;
  statusCode: string;
  /** Reported completion 0-100 (20260820000008); null = not assessed yet. */
  progressPercent: number | string | null;
  links: InitiativeLinkView[];
}

export interface InitiativeStatusOption {
  code: string;
  label: string;
}

/**
 * Today as `YYYY-MM-DD` in the viewer's own calendar. Built from the local
 * date PARTS, never `toISOString()` — that converts to UTC first and would
 * report yesterday for anyone east of Greenwich before 03:00.
 */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const errorKeys: Record<string, string> = {
  invalid_input: "errorInvalidInput",
  unauthenticated: "errorUnauthenticated",
  forbidden: "errorForbidden",
  duplicate: "errorDuplicate",
  unknown: "errorUnknown",
};

function ActionError({ state }: { state: InitiativeActionState }) {
  const t = useTranslations("InitiativesPanel");
  if (state?.status !== "error") return null;
  return (
    <p role="alert" className="sru-auth-alert error" style={{ marginTop: 8 }}>
      <AlertCircle size={15} aria-hidden />
      {t(errorKeys[state.message] ?? "errorUnknown")}
    </p>
  );
}

/**
 * The المبادرات tab: initiatives belonging to one strategic plan, each
 * linked to the targets it is meant to achieve. A link points at EITHER a
 * KPI (its plan-level target) or a specific annual target — the same XOR the
 * table enforces — so both readings of "المستهدف" on this screen are
 * supported without guessing between them.
 *
 * Read-only for anyone below strategicPlanning='approve': `canManage` hides
 * every form and button, and the underlying RLS refuses the write anyway.
 */
export function InitiativesPanel({
  planId,
  initiatives,
  targetOptions,
  orgUnitOptions,
  subGoalOptions,
  statusOptions,
  canManage,
}: {
  planId: string;
  initiatives: InitiativeView[];
  targetOptions: InitiativeTargetOption[];
  orgUnitOptions: Array<{ id: string; name: string }>;
  subGoalOptions: Array<{ id: string; title: string }>;
  statusOptions: InitiativeStatusOption[];
  canManage: boolean;
}) {
  const t = useTranslations("InitiativesPanel");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [createState, createAction, creating] = useActionState<InitiativeActionState, FormData>(createInitiative, null);
  const [handledCreate, setHandledCreate] = useState<InitiativeActionState>(null);

  // Derived during render, never in an effect (react-hooks/set-state-in-effect).
  if (createState !== handledCreate) {
    setHandledCreate(createState);
    if (createState?.status === "success") {
      setStartDate("");
      setEndDate("");
    }
  }

  useEffect(() => {
    if (createState?.status === "success") {
      formRef.current?.reset();
      // Closed only on success: an error keeps the dialog open with its
      // message inside, rather than dropping the reader back to the list.
      dialogRef.current?.close();
      router.refresh();
    }
  }, [createState, router]);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      createAction(formData);
    });
  }

  const addForm = (
    <form ref={formRef} onSubmit={handleCreate}>
      <div className="sru-formgrid">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="startDate" value={startDate} />
          <input type="hidden" name="endDate" value={endDate} />
          <div className="sru-field">
            <label>{t("titleArLabel")}</label>
            <input type="text" name="titleAr" required dir="rtl" />
          </div>
          <div className="sru-field">
            <label>{t("titleEnLabel")}</label>
            <input type="text" name="titleEn" required dir="ltr" style={{ textAlign: "left" }} />
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
              <span style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("subGoalEmptyHint")}</span>
            )}
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
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("descriptionLabel")}</label>
            <textarea name="descriptionAr" rows={2} dir="rtl" />
          </div>
        </div>

      <ActionError state={createState} />

      <div className="sru-form-submitrow">
        <button
          type="submit"
          disabled={creating || startDate === "" || endDate === ""}
          className="sru-btn sru-btn-primary"
        >
          {creating ? t("addSubmitting") : t("addSubmit")}
        </button>
        {(startDate === "" || endDate === "") && (
          <span style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("datesRequiredNote")}</span>
        )}
      </div>
    </form>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, flex: 1, minWidth: 240 }}>{t("intro")}</p>
        {canManage && (
          <AddFormDialog
            dialogRef={dialogRef}
            triggerLabel={t("addSubmit")}
            heading={t("addHeading")}
            subtitle={t("addSubtitle")}
            closeLabel={t("closeButton")}
          >
            {addForm}
          </AddFormDialog>
        )}
      </div>

      {initiatives.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14, marginBottom: 20 }}>{t("empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {initiatives.map((initiative) => (
            <InitiativeCard
              key={initiative.id}
              initiative={initiative}
              targetOptions={targetOptions}
              canManage={canManage}
            />
          ))}
        </div>
      )}

    </div>
  );
}

function InitiativeCard({
  initiative,
  targetOptions,
  canManage,
}: {
  initiative: InitiativeView;
  targetOptions: InitiativeTargetOption[];
  canManage: boolean;
}) {
  const t = useTranslations("InitiativesPanel");
  const locale = useLocale();
  const router = useRouter();
  const [linkState, linkAction, linking] = useActionState<InitiativeActionState, FormData>(linkInitiativeTarget, null);
  const [unlinkState, unlinkAction] = useActionState<InitiativeActionState, FormData>(unlinkInitiativeTarget, null);
  const [deleteState, deleteAction] = useActionState<InitiativeActionState, FormData>(deleteInitiative, null);

  useEffect(() => {
    if (linkState?.status === "success" || unlinkState?.status === "success" || deleteState?.status === "success") {
      router.refresh();
    }
  }, [linkState, unlinkState, deleteState, router]);

  const linkedValues = new Set(initiative.links.map((l) => l.label));
  const available = targetOptions.filter((o) => !linkedValues.has(o.label));

  const progress = initiativeProgress(
    {
      progressPercent: initiative.progressPercent,
      startDate: initiative.startDate,
      endDate: initiative.endDate,
      statusCode: initiative.statusCode,
    },
    todayIso()
  );

  const startText = initiative.startDate ? formatDateDmy(initiative.startDate, locale) : "—";
  const endText = initiative.endDate ? formatDateDmy(initiative.endDate, locale) : "—";
  const period = initiative.startDate || initiative.endDate ? `${startText} → ${endText}` : null;

  return (
    <div className="sru-card sru-initiative-card">
      <div className="sru-initiative-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ fontSize: 15, fontWeight: 700 }}>
            {/* The whole card follows this one link: `sru-stretched` casts an
                overlay across the card, and the controls below sit above it,
                so delete / link / unlink still work as their own targets. */}
            <Link href={`/initiatives/${initiative.id}`} className="sru-stretched sru-initiative-card-title">
              {initiative.titleAr}
              <ArrowLeft size={14} aria-hidden className="sru-initiative-card-go" />
            </Link>
          </h4>
          {initiative.titleEn && (
            <span dir="ltr" style={{ display: "block", color: "var(--sru-muted)", fontSize: 12 }}>
              {initiative.titleEn}
            </span>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span className={`sru-initiative-chip is-${initiative.statusCode}`}>{initiative.statusLabel}</span>
            {initiative.ownerOrgUnitName && <span className="sru-initiative-chip">{initiative.ownerOrgUnitName}</span>}
            {initiative.subGoalTitle && <span className="sru-initiative-chip">{initiative.subGoalTitle}</span>}
            {period && <span className="sru-initiative-chip is-plain">{period}</span>}
          </div>
          {initiative.descriptionAr && (
            <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.7 }}>{initiative.descriptionAr}</p>
          )}
        </div>
        {/* Placed after the text, so in an RTL row it renders on the LEFT. */}
        <InitiativeProgressRing progress={progress} />
        {/* View / edit / delete. They sit above the card's stretched link
            (see .sru-initiative-card-actions), so each is its own target. */}
        <div className="sru-initiative-card-actions">
          <Link
            href={`/initiatives/${initiative.id}`}
            className="sru-icon-action"
            title={t("viewButton")}
            aria-label={t("viewButton")}
          >
            <Eye size={15} aria-hidden />
          </Link>
          {canManage && (
            <>
              {/* Opens the same card editor the detail page hosts — one editor,
                  reached from either place, rather than a second copy here. */}
              <Link
                href={`/initiatives/${initiative.id}?edit=1`}
                className="sru-icon-action"
                title={t("editButton")}
                aria-label={t("editButton")}
              >
                <Pencil size={15} aria-hidden />
              </Link>
              <form
                action={(formData) => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  startTransition(() => deleteAction(formData));
                }}
              >
                <input type="hidden" name="initiativeId" value={initiative.id} />
                <button type="submit" className="sru-icon-action" title={t("deleteButton")} aria-label={t("deleteButton")}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="sru-initiative-card-foot" style={{ marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{t("linkedTargets")}</span>
        {initiative.links.length === 0 ? (
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>{t("noLinkedTargets")}</p>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {initiative.links.map((link) => (
              <li key={link.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {link.label}
                {canManage && (
                  <form action={(formData) => startTransition(() => unlinkAction(formData))} style={{ display: "inline" }}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <button
                      type="submit"
                      className="sru-icon-action"
                      title={t("unlinkButton")}
                      aria-label={t("unlinkButton")}
                      style={{ padding: 2 }}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && available.length > 0 && (
          <form
            action={(formData) => startTransition(() => linkAction(formData))}
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}
          >
            <input type="hidden" name="initiativeId" value={initiative.id} />
            <select name="target" required defaultValue="" style={{ maxWidth: 420 }}>
              <option value="" disabled>
                {t("linkPlaceholder")}
              </option>
              {available.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={linking} className="sru-btn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Link2 size={14} aria-hidden />
              {t("linkButton")}
            </button>
          </form>
        )}
      </div>

      <ActionError state={linkState} />
      <ActionError state={unlinkState} />
      <ActionError state={deleteState} />
    </div>
  );
}
