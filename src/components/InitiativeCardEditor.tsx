"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2, Eye, Link2, Pencil, Trash2 } from "lucide-react";
import {
  addInitiativeDependency,
  removeInitiativeDependency,
  updateInitiativeCard,
  type InitiativeCardState,
} from "@/app/[locale]/(app)/initiatives/[id]/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { missingInitiativeFields, type InitiativeFieldKey } from "@/lib/initiativeCompleteness";
import { AddFormDialog } from "@/components/AddFormDialog";
import { type AssignmentView } from "@/components/InitiativeAssignmentsEditor";
import { InitiativeAssignmentsSection } from "@/components/InitiativeAssignmentsSection";

export interface InitiativeCardFormValues {
  code: string;
  horizon: string;
  titleAr: string;
  titleEn: string;
  deliverableAr: string;
  descriptionAr: string;
  subGoalId: string;
  ownerOrgUnitId: string;
  budgetNote: string;
  statusCode: string;
  startDate: string;
  endDate: string;
  /** Reported completion 0-100; "" when not assessed yet. */
  progressPercent: string;
  /** Balanced-scorecard perspective code; "" when unclassified. */
  perspectiveCode: string;
  /** النتائج / المخرجات — one per line. */
  outcomesAr: string;
}

const errorKeys: Record<string, string> = {
  invalid_input: "cardErrorInvalidInput",
  unauthenticated: "cardErrorUnauthenticated",
  forbidden: "cardErrorForbidden",
  duplicate_code: "cardErrorDuplicateCode",
  unknown: "cardErrorUnknown",
};

/** Label key per field, so the banner and the inline marks stay in step. */
const labelKeys: Record<InitiativeFieldKey, string> = {
  code: "codeLabel",
  horizon: "horizonLabel",
  titleAr: "titleArLabel",
  titleEn: "titleEnLabel",
  deliverableAr: "deliverableLabel",
  subGoalId: "subGoalLabel",
  ownerOrgUnitId: "ownerLabel",
  budgetNote: "budgetLabel",
  statusCode: "statusLabel",
  startDate: "startDateLabel",
  endDate: "endDateLabel",
};

/**
 * Editor for the initiative's OWN card fields, beneath the printed card.
 *
 * Its reason to exist: both add-initiative forms now demand every field
 * except the definition, but initiatives entered before that rule can be
 * missing any of them and nothing in the app could edit them at all. So this
 * screen both fills the gap and NAMES it - the banner lists what is still
 * blank and each field carries a mark - while still accepting a partial save,
 * since an old card is completed a field at a time.
 */
export function InitiativeCardEditor({
  initiativeId,
  initial,
  subGoalOptions,
  orgUnitOptions,
  statusOptions,
  perspectiveOptions,
  dependencies,
  dependencyOptions,
  assignments,
  openOnMount = false,
}: {
  initiativeId: string;
  initial: InitiativeCardFormValues;
  subGoalOptions: Array<{ id: string; title: string }>;
  orgUnitOptions: Array<{ id: string; name: string }>;
  statusOptions: Array<{ code: string; label: string }>;
  perspectiveOptions: Array<{ code: string; label: string }>;
  /** Already-recorded dependencies, newest last. */
  dependencies: Array<{ id: string; label: string; initiativeId?: string }>;
  /** Other initiatives in the same plan, offered as new dependencies. */
  dependencyOptions: Array<{ id: string; label: string }>;
  /** Owning / participating / supporting departments, from the assignment slice. */
  assignments: AssignmentView[];
  /** Open the editor immediately — the row pencil links with ?edit=1. */
  openOnMount?: boolean;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<InitiativeCardFormValues>(initial);
  const [state, formAction, pending] = useActionState<InitiativeCardState, FormData>(updateInitiativeCard, null);
  const [handled, setHandled] = useState<InitiativeCardState>(null);
  const [saved, setSaved] = useState<InitiativeCardFormValues>(initial);

  // Derived during render, never in an effect (react-hooks/set-state-in-effect).
  if (state !== handled) {
    setHandled(state);
    if (state?.status === "success") setSaved(values);
  }

  useEffect(() => {
    if (state?.status === "success") {
      // Closed only on success: an error keeps the dialog open with its
      // message inside, so an edit in progress is never lost.
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  const set = (key: keyof InitiativeCardFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Computed from what is on screen right now, so a blank leaves the list as
  // it is typed - not only after saving.
  const missing = missingInitiativeFields(values);
  const dirty = (Object.keys(values) as Array<keyof InitiativeCardFormValues>).some((k) => values[k] !== saved[k]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const mark = (key: InitiativeFieldKey) =>
    missing.includes(key) ? (
      <span
        style={{
          marginInlineStart: 6,
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--sru-danger, #b91c1c)",
          border: "1px solid currentColor",
          borderRadius: 0,
          padding: "0 6px",
        }}
      >
        {t("missingMark")}
      </span>
    ) : null;

  const cardForm = (
    <form className="no-print" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <input type="hidden" name="startDate" value={values.startDate} />
      <input type="hidden" name="endDate" value={values.endDate} />

      <section className="sru-formsection">
        <div className="sru-formsection-head">
          <span className="sru-formsection-badge">
            <Pencil size={17} aria-hidden />
          </span>
          <div>
            <h3>{t("cardEditHeading")}</h3>
            <span>{t("cardEditSubtitle")}</span>
          </div>
        </div>

        {missing.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              background: "var(--sru-warning-bg, #fff7ed)",
              border: "1px solid var(--sru-warning, #f59e0b)",
              borderRadius: 0,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 12,
              lineHeight: 1.8,
            }}
          >
            <AlertCircle size={16} aria-hidden style={{ flex: "0 0 auto", marginTop: 3 }} />
            <span>
              <strong>{t("missingHeading", { count: missing.length })}</strong>{" "}
              {missing.map((key) => t(labelKeys[key])).join("، ")}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              color: "var(--sru-success, #15803d)",
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            <CheckCircle2 size={16} aria-hidden />
            <span>{t("missingNone")}</span>
          </div>
        )}

        <div className="sru-formgrid">
          <div className="sru-field">
            <label>
              {t("codeLabel")}
              {mark("code")}
            </label>
            <input
              type="text"
              name="code"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.code}
              onChange={(e) => set("code")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("horizonLabel")}
              {mark("horizon")}
            </label>
            <input
              type="text"
              name="horizon"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.horizon}
              onChange={(e) => set("horizon")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("titleArLabel")}
              {mark("titleAr")}
            </label>
            <input
              type="text"
              name="titleAr"
              required
              dir="rtl"
              value={values.titleAr}
              onChange={(e) => set("titleAr")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("titleEnLabel")}
              {mark("titleEn")}
            </label>
            <input
              type="text"
              name="titleEn"
              dir="ltr"
              style={{ textAlign: "left" }}
              value={values.titleEn}
              onChange={(e) => set("titleEn")(e.target.value)}
            />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>
              {t("deliverableLabel")}
              {mark("deliverableAr")}
            </label>
            <input
              type="text"
              name="deliverableAr"
              dir="rtl"
              value={values.deliverableAr}
              onChange={(e) => set("deliverableAr")(e.target.value)}
            />
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            {/* No mark: the definition is the one optional field. */}
            <label>{t("definitionLabel")}</label>
            <textarea
              name="descriptionAr"
              rows={3}
              dir="rtl"
              value={values.descriptionAr}
              onChange={(e) => set("descriptionAr")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            {/* Not in the missing-fields list: the four-perspective strip is a
                classification, not part of what makes a card complete. */}
            <label>{t("perspectiveLabel")}</label>
            <select
              name="perspectiveCode"
              value={values.perspectiveCode}
              onChange={(e) => set("perspectiveCode")(e.target.value)}
            >
              <option value="">{t("perspectiveNone")}</option>
              {perspectiveOptions.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field" style={{ gridColumn: "1 / -1" }}>
            <label>{t("outcomesEditLabel")}</label>
            <textarea
              name="outcomesAr"
              rows={3}
              dir="rtl"
              value={values.outcomesAr}
              onChange={(e) => set("outcomesAr")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("subGoalLabel")}
              {mark("subGoalId")}
            </label>
            <select name="subGoalId" value={values.subGoalId} onChange={(e) => set("subGoalId")(e.target.value)}>
              <option value="">{t("subGoalPlaceholder")}</option>
              {subGoalOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>
              {t("ownerLabel")}
              {mark("ownerOrgUnitId")}
            </label>
            <select name="ownerOrgUnitId" value={values.ownerOrgUnitId} onChange={(e) => set("ownerOrgUnitId")(e.target.value)}>
              <option value="">{t("ownerPlaceholder")}</option>
              {orgUnitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            <label>
              {t("budgetLabel")}
              {mark("budgetNote")}
            </label>
            <input
              type="text"
              name="budgetNote"
              dir="rtl"
              value={values.budgetNote}
              onChange={(e) => set("budgetNote")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("statusLabel")}
              {mark("statusCode")}
            </label>
            <select name="statusCode" required value={values.statusCode} onChange={(e) => set("statusCode")(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sru-field">
            {/* Not in the missing-fields list: progress is reported over time,
                not part of what makes a card complete on the day it is filed. */}
            <label>{t("progressLabel")}</label>
            <input
              type="number" lang="en"
              name="progressPercent"
              min={0}
              max={100}
              step={1}
              dir="ltr"
              style={{ textAlign: "left" }}
              placeholder={t("progressPlaceholder")}
              value={values.progressPercent}
              onChange={(e) => set("progressPercent")(e.target.value)}
            />
          </div>
          <div className="sru-field">
            <label>
              {t("startDateLabel")}
              {mark("startDate")}
            </label>
            <DateFieldDmy value={values.startDate} onChange={set("startDate")} ariaLabel={t("startDateLabel")} />
          </div>
          <div className="sru-field">
            <label>
              {t("endDateLabel")}
              {mark("endDate")}
            </label>
            <DateFieldDmy value={values.endDate} onChange={set("endDate")} ariaLabel={t("endDateLabel")} />
          </div>
        </div>
      </section>

      {state?.status === "error" && (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12, marginTop: 10 }}>
          {t(errorKeys[state.message] ?? "cardErrorUnknown")}
        </p>
      )}
      {state?.status === "success" && !dirty && (
        <p style={{ color: "var(--sru-success, #15803d)", fontSize: 12, marginTop: 10 }}>{t("cardSaved")}</p>
      )}

      <div className="sru-form-submitrow">
        <button type="submit" disabled={pending || !dirty} className="sru-btn sru-btn-primary">
          {pending ? t("cardSaving") : t("cardSave")}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* The form used to sit open under the card, which is most of the page
          for a reader who only came to LOOK at the initiative. It is now
          behind the pencil beside the card (2026-08-20 request); the page
          still shows what is missing on its own, so the signal does not
          disappear with the form. */}
      <span className="no-print">
        <AddFormDialog
          dialogRef={dialogRef}
          triggerLabel={t("cardEditHeading")}
          triggerIcon={<Pencil size={15} aria-hidden />}
          heading={t("cardEditHeading")}
          subtitle={t("cardEditSubtitle")}
          closeLabel={t("closeButton")}
          openOnMount={openOnMount}
        >
          {cardForm}
          <InitiativeAssignmentsSection
            initiativeId={initiativeId}
            assignments={assignments}
            orgUnits={orgUnitOptions}
          />
          <InitiativeDependenciesEditor
            initiativeId={initiativeId}
            dependencies={dependencies}
            options={dependencyOptions}
          />
        </AddFormDialog>
      </span>
    </>
  );
}

/**
 * التبعية مع المبادرات الاخرى — add / remove, one row at a time.
 *
 * Deliberately outside the card form: nesting forms is invalid HTML, and a
 * failed card save must not lose a dependency edit (or the other way round).
 */
function InitiativeDependenciesEditor({
  initiativeId,
  dependencies,
  options,
}: {
  initiativeId: string;
  dependencies: Array<{ id: string; label: string; initiativeId?: string }>;
  options: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const addDialogRef = useRef<HTMLDialogElement>(null);
  const [addState, addAction, adding] = useActionState<InitiativeCardState, FormData>(addInitiativeDependency, null);
  const [removeState, removeAction] = useActionState<InitiativeCardState, FormData>(removeInitiativeDependency, null);

  useEffect(() => {
    if (addState?.status === "success") addDialogRef.current?.close();
    if (addState?.status === "success" || removeState?.status === "success") router.refresh();
  }, [addState, removeState, router]);

  const taken = new Set(dependencies.map((d) => d.label));
  const available = options.filter((o) => !taken.has(o.label));

  return (
    <section className="sru-formsection no-print" style={{ marginTop: 16 }}>
      <div className="sru-formsection-head">
        <span className="sru-formsection-badge">
          <Link2 size={17} aria-hidden />
        </span>
        <div style={{ flex: 1 }}>
          <h3>{t("dependenciesEditLabel")}</h3>
        </div>
        {/* The add form is behind this button, on the heading's own row —
            the same shape the activities list uses (2026-08-21). */}
        {available.length > 0 && (
          <AddFormDialog
            dialogRef={addDialogRef}
            triggerLabel={t("dependencyAdd")}
            heading={t("dependencyAdd")}
            closeLabel={t("closeButton")}
          >
            <form action={(formData) => startTransition(() => addAction(formData))}>
              <div className="sru-field">
                <label>{t("dependenciesEditLabel")}</label>
                <select name="dependsOnInitiativeId" required defaultValue="">
                  <option value="">{t("dependencyPlaceholder")}</option>
                  {available.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input type="hidden" name="initiativeId" value={initiativeId} />
              <div className="sru-form-submitrow">
                <button type="submit" className="sru-btn sru-btn-primary" disabled={adding}>
                  {t("dependencyAdd")}
                </button>
              </div>
            </form>
          </AddFormDialog>
        )}
      </div>

      {dependencies.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 12 }}>{t("dependencyNone")}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {dependencies.map((d) => (
            <li
              key={d.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12 }}
            >
              <span>{d.label}</span>
              {/* View opens that initiative; there is nothing to "edit" on a
                  link between two initiatives, so it is view + remove. */}
              <span className="sru-initiative-card-actions">
                {d.initiativeId && (
                  <Link
                    href={`/initiatives/${d.initiativeId}`}
                    className="sru-icon-action"
                    title={t("dependencyView")}
                    aria-label={t("dependencyView")}
                  >
                    <Eye size={15} aria-hidden />
                  </Link>
                )}
                <form action={(formData) => startTransition(() => removeAction(formData))}>
                  <input type="hidden" name="dependencyId" value={d.id} />
                  <button
                    type="submit"
                    className="sru-icon-action"
                    title={t("dependencyRemove")}
                    aria-label={t("dependencyRemove")}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(addState?.status === "error" || removeState?.status === "error") && (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 12, marginTop: 8 }}>
          {t(errorKeys[(addState ?? removeState)?.status === "error" ? ((addState ?? removeState) as { message: string }).message : "unknown"] ?? "cardErrorUnknown")}
        </p>
      )}
    </section>
  );
}
