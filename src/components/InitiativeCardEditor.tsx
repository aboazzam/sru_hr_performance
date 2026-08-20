"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, CheckCircle2, Link2, Pencil, X } from "lucide-react";
import {
  addInitiativeDependency,
  removeInitiativeDependency,
  updateInitiativeCard,
  type InitiativeCardState,
} from "@/app/[locale]/(app)/initiatives/[id]/actions";
import { DateFieldDmy } from "@/components/DateFieldDmy";
import { missingInitiativeFields, type InitiativeFieldKey } from "@/lib/initiativeCompleteness";

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
}: {
  initiativeId: string;
  initial: InitiativeCardFormValues;
  subGoalOptions: Array<{ id: string; title: string }>;
  orgUnitOptions: Array<{ id: string; name: string }>;
  statusOptions: Array<{ code: string; label: string }>;
  perspectiveOptions: Array<{ code: string; label: string }>;
  /** Already-recorded dependencies, newest last. */
  dependencies: Array<{ id: string; label: string }>;
  /** Other initiatives in the same plan, offered as new dependencies. */
  dependencyOptions: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
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
    if (state?.status === "success") router.refresh();
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
          fontSize: 11,
          fontWeight: 700,
          color: "var(--sru-danger, #b91c1c)",
          border: "1px solid currentColor",
          borderRadius: 999,
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
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
              fontSize: 13,
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
              fontSize: 13,
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
              type="number"
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
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 13, marginTop: 10 }}>
          {t(errorKeys[state.message] ?? "cardErrorUnknown")}
        </p>
      )}
      {state?.status === "success" && !dirty && (
        <p style={{ color: "var(--sru-success, #15803d)", fontSize: 13, marginTop: 10 }}>{t("cardSaved")}</p>
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
      {cardForm}
      <InitiativeDependenciesEditor
        initiativeId={initiativeId}
        dependencies={dependencies}
        options={dependencyOptions}
      />
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
  dependencies: Array<{ id: string; label: string }>;
  options: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("InitiativePage");
  const router = useRouter();
  const [addState, addAction, adding] = useActionState<InitiativeCardState, FormData>(addInitiativeDependency, null);
  const [removeState, removeAction] = useActionState<InitiativeCardState, FormData>(removeInitiativeDependency, null);

  useEffect(() => {
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
        <div>
          <h3>{t("dependenciesEditLabel")}</h3>
        </div>
      </div>

      {dependencies.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 13 }}>{t("dependencyNone")}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {dependencies.map((d) => (
            <li key={d.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {d.label}
              <form action={(formData) => startTransition(() => removeAction(formData))} style={{ display: "inline" }}>
                <input type="hidden" name="dependencyId" value={d.id} />
                <button
                  type="submit"
                  className="sru-icon-action"
                  title={t("dependencyRemove")}
                  aria-label={t("dependencyRemove")}
                  style={{ padding: 2 }}
                >
                  <X size={12} aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <form
          action={(formData) => startTransition(() => addAction(formData))}
          style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}
        >
          <input type="hidden" name="initiativeId" value={initiativeId} />
          <select name="dependsOnInitiativeId" required defaultValue="" style={{ maxWidth: 420, flex: 1 }}>
            <option value="">{t("dependencyPlaceholder")}</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className="sru-btn" disabled={adding}>
            {t("dependencyAdd")}
          </button>
        </form>
      )}

      {(addState?.status === "error" || removeState?.status === "error") && (
        <p style={{ color: "var(--sru-danger, #b91c1c)", fontSize: 13, marginTop: 8 }}>
          {t(errorKeys[(addState ?? removeState)?.status === "error" ? ((addState ?? removeState) as { message: string }).message : "unknown"] ?? "cardErrorUnknown")}
        </p>
      )}
    </section>
  );
}
