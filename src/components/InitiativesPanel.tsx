"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Link2, Plus, Trash2, X } from "lucide-react";
import {
  createInitiative,
  deleteInitiative,
  linkInitiativeTarget,
  unlinkInitiativeTarget,
  type InitiativeActionState,
} from "@/app/[locale]/(app)/kpis/plans/[id]/initiatives/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";

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
  ownerPositionName: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  links: InitiativeLinkView[];
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
  positionOptions,
  canManage,
}: {
  planId: string;
  initiatives: InitiativeView[];
  targetOptions: InitiativeTargetOption[];
  positionOptions: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const t = useTranslations("InitiativesPanel");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
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

  return (
    <div>
      <p style={{ color: "var(--sru-muted)", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>{t("intro")}</p>

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

      {canManage && (
        <form ref={formRef} onSubmit={handleCreate}>
          <section className="sru-formsection">
            <div className="sru-formsection-head">
              <span className="sru-formsection-badge">
                <Plus size={17} aria-hidden />
              </span>
              <div>
                <h3>{t("addHeading")}</h3>
                <span>{t("addSubtitle")}</span>
              </div>
            </div>
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
                <input type="text" name="titleEn" dir="ltr" style={{ textAlign: "left" }} />
              </div>
              <div className="sru-field">
                <label>{t("ownerLabel")}</label>
                <select name="ownerPositionId" defaultValue="">
                  <option value="">{t("ownerNone")}</option>
                  {positionOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sru-field">
                <label>{t("statusLabel")}</label>
                <input type="text" name="status" dir="rtl" placeholder={t("statusPlaceholder")} />
              </div>
              <div className="sru-field">
                <label>{t("startDateLabel")}</label>
                <DateFieldDmy value={startDate} onChange={setStartDate} />
              </div>
              <div className="sru-field">
                <label>{t("endDateLabel")}</label>
                <DateFieldDmy value={endDate} onChange={setEndDate} />
              </div>
              <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
                <label>{t("descriptionLabel")}</label>
                <textarea name="descriptionAr" rows={2} dir="rtl" />
              </div>
            </div>
          </section>

          <ActionError state={createState} />

          <div className="sru-form-submitrow">
            <button type="submit" disabled={creating} className="sru-btn sru-btn-primary">
              {creating ? t("addSubmitting") : t("addSubmit")}
            </button>
          </div>
        </form>
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

  return (
    <div className="sru-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 700 }}>{initiative.titleAr}</h4>
          {initiative.titleEn && (
            <span dir="ltr" style={{ display: "block", color: "var(--sru-muted)", fontSize: 12 }}>
              {initiative.titleEn}
            </span>
          )}
          <p style={{ color: "var(--sru-muted)", fontSize: 12, marginTop: 4 }}>
            {t("statusValue", { status: initiative.status })}
            {initiative.ownerPositionName ? ` · ${t("ownerValue", { owner: initiative.ownerPositionName })}` : ""}
            {initiative.startDate || initiative.endDate
              ? ` · ${initiative.startDate ?? "—"} → ${initiative.endDate ?? "—"}`
              : ""}
          </p>
          {initiative.descriptionAr && (
            <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.7 }}>{initiative.descriptionAr}</p>
          )}
        </div>
        {canManage && (
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
        )}
      </div>

      <div style={{ marginTop: 12 }}>
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
